import { Prisma, type WorkspaceOAuthApp } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { config } from './config';
import { encrypt, decrypt } from './crypto';
import { authorize, type Actor } from './auth';
import { invariant } from '../domain/errors';

export const platformSchema = z.enum(['youtube', 'tiktok']);
export type Platform = z.infer<typeof platformSchema>;
export const oauthAppInput = z.object({
  clientId: z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9._-]+$/, 'Client ID/Key không hợp lệ.'),
  clientSecret: z.string().trim().max(2000).optional(),
  expectedVersion: z.number().int().min(0),
  confirmDisconnect: z.boolean().default(false),
}).strict();
export const oauthRedirectUri = (platform: Platform) => config.appUrl + '/api/integrations/' + platform + '/callback';

export async function lockOAuthApp(tx: Prisma.TransactionClient, workspaceId: string, platform: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'oauth-app:' + workspaceId + ':' + platform}))`;
}

export function credentialsFor(app: WorkspaceOAuthApp | null) {
  invariant(app?.clientId && app.encryptedSecret, 'OAUTH_CONFIG', 'Chủ sở hữu cần lưu cấu hình ứng dụng trong Kết nối nền tảng của studio này.', 409);
  return { clientId: app.clientId, secret: decrypt(app.encryptedSecret), version: app.version };
}

function publicConfig(app: WorkspaceOAuthApp | null, platform: Platform, connectedAccounts: number) {
  return {
    platform, clientId: app?.clientId || '', configured: !!(app?.clientId && app.encryptedSecret),
    hasSecret: !!app?.encryptedSecret, version: app?.version || 0, connectedAccounts,
    redirectUri: oauthRedirectUri(platform),
    webhookUrl: platform === 'tiktok' && app?.clientId && app.encryptedSecret ? config.appUrl + '/api/webhooks/tiktok/' + app.id : null,
  };
}

export async function readOAuthApp(actor: Actor, platform: Platform) {
  authorize(actor, ['OWNER']);
  const [app, count] = await Promise.all([
    db.workspaceOAuthApp.findUnique({ where: { workspaceId_platform: { workspaceId: actor.workspaceId, platform } } }),
    db.socialAccount.count({ where: { workspaceId: actor.workspaceId, platform, disconnectedAt: null } }),
  ]);
  return publicConfig(app, platform, count);
}

export async function changeOAuthApp(actor: Actor, platform: Platform, input: unknown, remove = false) {
  authorize(actor, ['OWNER']);
  const data = remove
    ? z.object({ expectedVersion: z.number().int().min(0), confirmDisconnect: z.literal(true) }).strict().parse(input)
    : oauthAppInput.parse(input);
  return db.$transaction(async tx => {
    // Same workspace lock as the publishing worker's claim; never rotate during an upload.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.workspaceId}))`;
    await lockOAuthApp(tx, actor.workspaceId, platform);
    const where = { workspaceId: actor.workspaceId, platform };
    const current = await tx.workspaceOAuthApp.findUnique({ where: { workspaceId_platform: where } });
    invariant((current?.version || 0) === data.expectedVersion, 'OAUTH_CONFIG_CONFLICT', 'Cấu hình đã thay đổi. Tải lại trước khi lưu.', 409);
    const connected = await tx.socialAccount.count({ where: { ...where, disconnectedAt: null } });
    const supplied = 'clientId' in data ? data : null;
    const clientId = supplied?.clientId || null;
    const secret = supplied?.clientSecret || null;
    if (!remove) {
      invariant(secret || (current?.clientId === clientId && current.encryptedSecret), 'OAUTH_SECRET_REQUIRED', 'Nhập Client Secret khi tạo cấu hình hoặc thay Client ID/Key.');
      if (current?.clientId === clientId && current.encryptedSecret && (!secret || decrypt(current.encryptedSecret) === secret)) return publicConfig(current, platform, connected);
    } else if (!current?.encryptedSecret) return publicConfig(current, platform, connected);
    invariant(!connected || data.confirmDisconnect, 'OAUTH_DISCONNECT_CONFIRMATION', 'Xác nhận ngắt tài khoản đang kết nối trước khi đổi hoặc xóa cấu hình.', 409);
    invariant(!await tx.publishingJob.count({ where: { account: where, status: 'UPLOADING' } }), 'OAUTH_UPLOAD_ACTIVE', 'Có video đang tải lên nền tảng. Đợi upload hoàn tất hoặc đối soát trước khi thay cấu hình.', 409);
    const app = await tx.workspaceOAuthApp.upsert({
      where: { workspaceId_platform: where },
      create: { ...where, clientId, encryptedSecret: secret ? encrypt(secret) : null },
      update: { clientId, encryptedSecret: secret ? encrypt(secret) : null, version: { increment: 1 } },
    });
    await tx.oAuthState.deleteMany({ where });
    await tx.socialAccount.updateMany({ where, data: { disconnectedAt: new Date() } });
    await tx.socialAccountCredential.deleteMany({ where: { socialAccount: where } });
    await tx.publishingJob.updateMany({ where: { account: where, status: { in: ['READY_TO_PUBLISH', 'AWAITING_APPROVAL'] } }, data: { status: 'CANCELLED', consentAt: null, error: 'Cấu hình OAuth đã đổi. Kết nối lại tài khoản và tạo yêu cầu xuất bản mới.' } });
    await tx.auditLog.create({ data: { workspaceId: actor.workspaceId, actorId: actor.userId, action: remove ? 'oauth.app-cleared' : 'oauth.app-updated', entityId: app.id } });
    return publicConfig(app, platform, 0);
  });
}

export async function oauthCapabilities(workspaceId: string) {
  const apps = await db.workspaceOAuthApp.findMany({ where: { workspaceId, clientId: { not: null }, encryptedSecret: { not: null } }, select: { platform: true } });
  return { youtubeOAuth: apps.some(app => app.platform === 'youtube'), tiktokOAuth: apps.some(app => app.platform === 'tiktok') };
}
