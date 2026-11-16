import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import type { Role } from '@prisma/client';
import { db } from './db';
import { config } from './config';
import { hashToken } from './crypto';
import { AppError, invariant } from '../domain/errors';
import { redis } from './queue';
export type Actor = {userId:string;workspaceId:string;role:Role;name:string;email:string};
export async function sessionActor(token?:string):Promise<Actor|null> {
  if(!token) return null;
  const session=await db.session.findUnique({where:{tokenHash:hashToken(token)},include:{user:true,workspace:{select:{archivedAt:true}}}});
  if(!session || session.expiresAt < new Date() || session.workspace.archivedAt) return null;
  const member=await db.workspaceMember.findUnique({where:{workspaceId_userId:{workspaceId:session.workspaceId,userId:session.userId}}});
  return member ? {userId:session.userId,workspaceId:session.workspaceId,role:member.role,name:session.user.name,email:session.user.email} : null;
}
export async function currentActor() { const jar=await cookies(); return sessionActor(jar.get(config.cookieName)?.value); }
export async function requireActor() { const actor=await currentActor(); invariant(actor,'UNAUTHENTICATED','Vui lòng đăng nhập.',401); return actor; }
export function authorize(actor:Actor, roles:Role[]=['OWNER','EDITOR']) { invariant(roles.includes(actor.role),'FORBIDDEN','Bạn không có quyền thực hiện thao tác này.',403); }
export async function createSession(userId:string,workspaceId:string,expectedPasswordHash?:string) {
  const token=randomBytes(32).toString('base64url');
  await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;if(expectedPasswordHash){const user=await tx.user.findUniqueOrThrow({where:{id:userId}});invariant(user.passwordHash===expectedPasswordHash&&!user.totpSecret,'AUTH_CHANGED','Thiết lập đăng nhập đã đổi. Vui lòng đăng nhập lại.',401);}invariant(await tx.workspaceMember.findFirst({where:{userId,workspaceId,workspace:{archivedAt:null}}}),'WORKSPACE','Workspace không còn hoạt động.',403);await tx.session.create({data:{tokenHash:hashToken(token),userId,workspaceId,expiresAt:new Date(Date.now()+config.sessionDays*86400000)}});});
  return token;
}
export function checkOrigin(request:Request) {
  const origin=request.headers.get('origin');
  invariant(origin && origin===new URL(config.appUrl).origin,'CSRF','Nguồn yêu cầu không hợp lệ.',403);
}
export async function rateLimit(key:string,limit=60,seconds=60) {
  const count=await redis().eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",1,'rate:'+hashToken(key),seconds);
  if(Number(count)>limit) throw new AppError('RATE_LIMIT','Quá nhiều yêu cầu. Vui lòng thử lại sau.',429);
}
export async function audit(actor:Actor,action:string,entityId?:string) {
  await db.auditLog.create({data:{workspaceId:actor.workspaceId,actorId:actor.userId,action,entityId}});
}
