import {randomBytes} from 'node:crypto';
import {Prisma,Role} from '@prisma/client';
import {z} from 'zod';
import {db,adminDb} from './db';
import {Actor} from './auth';
import {hashToken} from './crypto';
import {config} from './config';
import {invariant} from '../domain/errors';

export const roleSchema=z.enum(['OWNER','EDITOR','REVIEWER','VIEWER']);
export const invitationSchema=z.object({email:z.string().trim().email().max(250).transform(s=>s.toLowerCase()),role:roleSchema.default('EDITOR')});
async function ownerLock(tx:Prisma.TransactionClient,actor:Actor){
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.workspaceId}))`;
  const member=await tx.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId:actor.workspaceId,userId:actor.userId}}});
  invariant(member?.role==='OWNER','FORBIDDEN','Chỉ chủ sở hữu được quản lý thành viên.',403);
}
export async function workspaceMembers(actor:Actor){
  const member=await db.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId:actor.workspaceId,userId:actor.userId}}});
  invariant(member,'FORBIDDEN','Bạn không còn thuộc workspace này.',403);
  const members=await db.workspaceMember.findMany({where:{workspaceId:actor.workspaceId},select:{id:true,userId:true,role:true,createdAt:true,user:{select:{name:true,email:true}}},orderBy:{createdAt:'asc'}});
  const invitations=member.role==='OWNER'?await db.workspaceInvitation.findMany({where:{workspaceId:actor.workspaceId},select:{id:true,email:true,role:true,createdAt:true,expiresAt:true,acceptedAt:true,revokedAt:true},orderBy:{createdAt:'desc'},take:50}):[];
  return {members,invitations};
}
export async function inviteMember(actor:Actor,value:unknown){
  const input=invitationSchema.parse(value),token=randomBytes(32).toString('base64url');
  const invitation=await db.$transaction(async tx=>{
    await ownerLock(tx,actor);
    invariant(!await tx.workspaceMember.findFirst({where:{workspaceId:actor.workspaceId,user:{email:input.email}}}),'ALREADY_MEMBER','Email này đã là thành viên.',409);
    await tx.workspaceInvitation.updateMany({where:{workspaceId:actor.workspaceId,email:input.email,acceptedAt:null,revokedAt:null},data:{revokedAt:new Date()}});
    const created=await tx.workspaceInvitation.create({data:{...input,workspaceId:actor.workspaceId,createdBy:actor.userId,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+7*86400000)}});
    await tx.auditLog.create({data:{workspaceId:actor.workspaceId,actorId:actor.userId,action:'member.invite',entityId:created.id,details:{email:input.email,role:input.role}}});
    return {id:created.id,email:created.email,role:created.role,expiresAt:created.expiresAt};
  });
  return {...invitation,url:config.appUrl+'/join#invite='+token};
}
export async function revokeInvitation(actor:Actor,id:string){
  return db.$transaction(async tx=>{
    await ownerLock(tx,actor);
    const changed=await tx.workspaceInvitation.updateMany({where:{id,workspaceId:actor.workspaceId,acceptedAt:null,revokedAt:null},data:{revokedAt:new Date()}});
    invariant(changed.count,'INVITE_STATE','Lời mời không tồn tại hoặc đã sử dụng.',409);
    await tx.auditLog.create({data:{workspaceId:actor.workspaceId,actorId:actor.userId,action:'member.invite.revoke',entityId:id}});return {ok:true};
  });
}
export async function acceptInvitation(actor:Actor,value:unknown){
  const {token}=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).parse(value);
  const tokenHash=hashToken(token),candidate=await adminDb.workspaceInvitation.findUnique({where:{tokenHash}});
  invariant(candidate,'INVITE_INVALID','Lời mời không hợp lệ.',404);
  return adminDb.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${candidate.workspaceId}))`;
    const invitation=await tx.workspaceInvitation.findUnique({where:{id:candidate.id}});
    invariant(invitation&&!invitation.revokedAt&&!invitation.acceptedAt&&invitation.expiresAt>new Date(),'INVITE_EXPIRED','Lời mời đã hết hạn, bị thu hồi hoặc đã sử dụng.',409);
    invariant(await tx.workspace.findFirst({where:{id:candidate.workspaceId,archivedAt:null}}),'WORKSPACE_ARCHIVED','Workspace đã được lưu trữ.',409);
    const user=await tx.user.findUniqueOrThrow({where:{id:actor.userId}});
    invariant(user.email.toLowerCase()===invitation.email,'INVITE_EMAIL','Đăng nhập bằng đúng email nhận lời mời.',403);
    invariant(!await tx.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId:invitation.workspaceId,userId:actor.userId}}}),'ALREADY_MEMBER','Bạn đã là thành viên workspace này.',409);
    await tx.workspaceMember.create({data:{workspaceId:invitation.workspaceId,userId:actor.userId,role:invitation.role}});
    await tx.workspaceInvitation.update({where:{id:invitation.id},data:{acceptedAt:new Date(),acceptedBy:actor.userId}});
    await tx.auditLog.create({data:{workspaceId:invitation.workspaceId,actorId:actor.userId,action:'member.join',entityId:invitation.id}});
    return {workspaceId:invitation.workspaceId};
  });
}
export async function changeMember(actor:Actor,userId:string,role:Role|null){
  if(role!==null)roleSchema.parse(role);
  return db.$transaction(async tx=>{
    await ownerLock(tx,actor);
    const member=await tx.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId:actor.workspaceId,userId}}});
    invariant(member,'NOT_FOUND','Không tìm thấy thành viên.',404);
    if(member.role==='OWNER'&&role!=='OWNER')invariant(await tx.workspaceMember.count({where:{workspaceId:actor.workspaceId,role:'OWNER'}})>1,'LAST_OWNER','Workspace cần ít nhất một chủ sở hữu.',409);
    if(role)await tx.workspaceMember.update({where:{id:member.id},data:{role}});
    else{
      const email=(await tx.user.findUniqueOrThrow({where:{id:userId}})).email;
      await tx.workspaceMember.delete({where:{id:member.id}});
      await tx.session.deleteMany({where:{workspaceId:actor.workspaceId,userId}});
      await tx.workspaceInvitation.updateMany({where:{workspaceId:actor.workspaceId,email,acceptedAt:null,revokedAt:null},data:{revokedAt:new Date()}});
    }
    await tx.auditLog.create({data:{workspaceId:actor.workspaceId,actorId:actor.userId,action:role?'member.role':'member.remove',entityId:userId,details:{previousRole:member.role,role}}});
    return {ok:true};
  });
}
