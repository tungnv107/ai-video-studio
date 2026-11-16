import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {Prisma} from '@prisma/client';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import {z} from 'zod';
import {db} from './db';
import {Actor,rateLimit,createSession,audit} from './auth';
import {decrypt,encrypt,hashPassword,hashToken,verifyPassword} from './crypto';
import {invariant} from '../domain/errors';
import {config} from './config';
import {log} from './logger';
import {base32,matchingCounter} from '../domain/totp';
export {base32,totp,matchingCounter} from '../domain/totp';
function same(a:string,b:string){return a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export async function newChallenge(userId:string,kind:'MFA'|'RESET',expectedPasswordHash?:string){
  const token=randomBytes(32).toString('base64url');await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;if(expectedPasswordHash){const user=await tx.user.findUniqueOrThrow({where:{id:userId}});invariant(user.passwordHash===expectedPasswordHash&&user.totpSecret,'AUTH_CHANGED','Thiết lập đăng nhập đã thay đổi.',401);}await tx.authChallenge.create({data:{userId,kind,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+(kind==='MFA'?5:15)*60000)}});});return token;
}
async function verifySecondFactor(tx:Prisma.TransactionClient,userId:string,code:string){
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
  const user=await tx.user.findUniqueOrThrow({where:{id:userId}});invariant(user.totpSecret,'MFA_DISABLED','Xác thực hai bước chưa bật.',409);
  const step=matchingCounter(decrypt(user.totpSecret),code,user.totpCounter);
  if(step!==null){await tx.user.update({where:{id:userId},data:{totpCounter:step}});return;}
  const hash=hashToken(code.replace(/\s/g,'').toUpperCase());invariant(user.recoveryHashes.some(h=>same(h,hash)),'MFA_CODE','Mã xác thực không hợp lệ hoặc đã được dùng.',401);
  await tx.user.update({where:{id:userId},data:{recoveryHashes:user.recoveryHashes.filter(h=>h!==hash)}});
}
export async function completeMfa(input:unknown){
  const {challenge,code}=z.object({challenge:z.string().length(43),code:z.string().min(6).max(50)}).parse(input);await rateLimit('mfa:'+challenge,8,300);
  const sessionToken=randomBytes(32).toString("base64url");return db.$transaction(async tx=>{const c=await tx.authChallenge.findUnique({where:{tokenHash:hashToken(challenge)}});invariant(c&&c.kind==='MFA'&&!c.usedAt&&c.expiresAt>new Date(),'CHALLENGE','Phiên xác thực đã hết hạn.',401);await verifySecondFactor(tx,c.userId,code);const used=await tx.authChallenge.updateMany({where:{id:c.id,usedAt:null},data:{usedAt:new Date()}});invariant(used.count,'CHALLENGE','Phiên xác thực đã dùng.',401);const member=await tx.workspaceMember.findFirst({where:{userId:c.userId,workspace:{archivedAt:null}},orderBy:{createdAt:'asc'}});invariant(member,'WORKSPACE','Tài khoản không có workspace đang hoạt động.',403);await tx.session.create({data:{userId:c.userId,workspaceId:member.workspaceId,tokenHash:hashToken(sessionToken),expiresAt:new Date(Date.now()+config.sessionDays*86400000)}});return sessionToken;});
}
export async function requestPasswordReset(input:unknown){
  const {email}=z.object({email:z.string().email().max(250).transform(x=>x.toLowerCase().trim())}).parse(input);await rateLimit('reset-global',30,300);await rateLimit('reset:'+email,3,900);
  const user=await db.user.findUnique({where:{email}});
  if(user&&process.env.SMTP_HOST&&process.env.SMTP_FROM){
    const token=await newChallenge(user.id,'RESET');
    try{const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',requireTLS:process.env.SMTP_REQUIRE_TLS!=='false',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined,connectionTimeout:10000,socketTimeout:15000});await transport.sendMail({from:process.env.SMTP_FROM,to:user.email,subject:'Đặt lại mật khẩu Video Studio',text:`Bạn vừa yêu cầu đặt lại mật khẩu. Liên kết dùng một lần, hết hạn sau 15 phút:\n${config.appUrl}/login#reset=${token}\nNếu bạn không yêu cầu, hãy bỏ qua email này.`});}catch{log.warn('password_reset_delivery_failed');await db.authChallenge.deleteMany({where:{tokenHash:hashToken(token)}});}
  }
  return {message:'Nếu email tồn tại và dịch vụ email đã được cấu hình, liên kết đặt lại mật khẩu sẽ được gửi.'};
}
export async function resetPassword(input:unknown){
  const data=z.object({token:z.string().length(43),password:z.string().min(12).max(128),code:z.string().max(50).optional()}).parse(input);await rateLimit('reset-token:'+data.token,8,900);
  await db.$transaction(async tx=>{const c=await tx.authChallenge.findUnique({where:{tokenHash:hashToken(data.token)}});invariant(c&&c.kind==='RESET'&&!c.usedAt&&c.expiresAt>new Date(),'RESET_TOKEN','Liên kết không hợp lệ hoặc hết hạn.',401);await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${c.userId}))`;const user=await tx.user.findUniqueOrThrow({where:{id:c.userId}});if(user.totpSecret)await verifySecondFactor(tx,user.id,data.code||'');const used=await tx.authChallenge.updateMany({where:{id:c.id,usedAt:null},data:{usedAt:new Date()}});invariant(used.count,'RESET_TOKEN','Liên kết đã sử dụng.',401);await tx.user.update({where:{id:user.id},data:{passwordHash:hashPassword(data.password)}});await tx.session.deleteMany({where:{userId:user.id}});await tx.authChallenge.updateMany({where:{userId:user.id,usedAt:null},data:{usedAt:new Date()}});});return {ok:true};
}
export async function securityAction(actor:Actor,action:string,method:string,input:unknown){
  if(method==='GET'){const u=await db.user.findUniqueOrThrow({where:{id:actor.userId},select:{totpSecret:true,recoveryHashes:true}});return {enabled:!!u.totpSecret,recoveryRemaining:u.recoveryHashes.length,emailConfigured:!!process.env.SMTP_HOST};}
  await rateLimit('security:'+actor.userId,10,300);
  const data=z.object({password:z.string().min(1).max(128),code:z.string().max(50).optional()}).parse(input),user=await db.user.findUniqueOrThrow({where:{id:actor.userId}});invariant(verifyPassword(data.password,user.passwordHash),'PASSWORD','Mật khẩu không đúng.',401);
  if(action==='setup'){
    invariant(!user.totpSecret,'MFA_ENABLED','Xác thực hai bước đã bật.',409);const secret=base32(randomBytes(20));await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;const fresh=await tx.user.findUniqueOrThrow({where:{id:user.id}});invariant(!fresh.totpSecret&&verifyPassword(data.password,fresh.passwordHash),'AUTH_CHANGED','Thiết lập đăng nhập đã thay đổi.',401);await tx.user.update({where:{id:user.id},data:{totpPending:encrypt(secret),totpPendingUntil:new Date(Date.now()+600000)}});});
    const uri=`otpauth://totp/${encodeURIComponent('Video Studio:'+user.email)}?secret=${secret}&issuer=Video%20Studio&digits=6&period=30`;return {secret,qr:await QRCode.toDataURL(uri)};
  }
  if(action==='enable'){
    const codes=Array.from({length:10},()=>randomBytes(8).toString('hex').toUpperCase());
    await db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;const fresh=await tx.user.findUniqueOrThrow({where:{id:user.id}});invariant(verifyPassword(data.password,fresh.passwordHash),'AUTH_CHANGED','Mật khẩu đã thay đổi.',401);invariant(!fresh.totpSecret&&fresh.totpPending&&fresh.totpPendingUntil&&fresh.totpPendingUntil>new Date(),'MFA_SETUP','Cần thiết lập lại mã QR.',409);const step=matchingCounter(decrypt(fresh.totpPending),data.code||'',0);invariant(step!==null,'MFA_CODE','Mã xác thực không đúng.',401);await tx.user.update({where:{id:user.id},data:{totpSecret:fresh.totpPending,totpPending:null,totpPendingUntil:null,totpCounter:step,recoveryHashes:codes.map(hashToken)}});await tx.session.deleteMany({where:{userId:user.id}});await tx.authChallenge.updateMany({where:{userId:user.id,usedAt:null},data:{usedAt:new Date()}});});await audit(actor,'security.mfa.enable');return {recoveryCodes:codes,reauthenticate:true};
  }
  invariant(action==='disable','ACTION','Thao tác không hợp lệ.');await db.$transaction(async tx=>{await verifySecondFactor(tx,user.id,data.code||'');const fresh=await tx.user.findUniqueOrThrow({where:{id:user.id}});invariant(verifyPassword(data.password,fresh.passwordHash),'AUTH_CHANGED','Mật khẩu đã thay đổi.',401);await tx.user.update({where:{id:user.id},data:{totpSecret:null,totpPending:null,totpPendingUntil:null,totpCounter:0,recoveryHashes:[]}});await tx.session.deleteMany({where:{userId:user.id}});});await audit(actor,'security.mfa.disable');return {ok:true,reauthenticate:true};
}
