import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { hashToken, decrypt } from './crypto';
import { invariant } from '../domain/errors';
import { lockOAuthApp } from './oauth-apps';

export function verifyTikTokSignature(raw: string, header: string, secret: string, now = Date.now()) {
  const fields = header.split(',').map(x => x.trim().split('=')), timestamp = fields.find(x => x[0] === 't')?.[1], signatures = fields.filter(x => x[0] === 's').map(x => x[1]);
  if (!secret || !timestamp || !/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', secret).update(timestamp + '.' + raw).digest();
  return signatures.some(s => /^[\da-f]{64}$/i.test(s) && timingSafeEqual(Buffer.from(s, 'hex'), expected));
}

export async function tiktokWebhook(request: Request, appId?: string) {
  invariant(request.method === 'POST', 'METHOD', 'Chỉ nhận POST.', 405);
  invariant(appId && /^[A-Za-z0-9_-]{1,100}$/.test(appId), 'WEBHOOK_CONFIG', 'Dùng URL webhook trong cấu hình TikTok của studio.', 401);
  invariant(Number(request.headers.get('content-length') || 0) <= 100000, 'TOO_LARGE', 'Payload quá lớn.', 413);
  const reader = request.body?.getReader(); invariant(reader, 'WEBHOOK_BODY', 'Thiếu payload.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 100000) { await reader.cancel(); invariant(false, 'TOO_LARGE', 'Payload quá lớn.', 413); }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  const owner = await db.workspaceOAuthApp.findFirst({ where: { id: appId, platform: 'tiktok', workspace: { archivedAt: null } }, select: { workspaceId: true } });
  invariant(owner, 'WEBHOOK_SIGNATURE', 'Chữ ký webhook không hợp lệ.', 401);
  await db.$transaction(async tx => {
    await lockOAuthApp(tx, owner.workspaceId, 'tiktok');
    const app = await tx.workspaceOAuthApp.findUnique({ where: { id: appId } });
    invariant(app?.clientId && app.encryptedSecret && verifyTikTokSignature(raw, request.headers.get('tiktok-signature') || '', decrypt(app.encryptedSecret)), 'WEBHOOK_SIGNATURE', 'Chữ ký webhook không hợp lệ.', 401);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { invariant(false, 'WEBHOOK_BODY', 'JSON không hợp lệ.'); }
    const payload = z.object({ event: z.string().max(100), user_openid: z.string().max(200).optional(), content: z.union([z.string().max(90000), z.record(z.string(), z.unknown())]).optional(), client_key: z.string().optional() }).passthrough().parse(parsed);
    if (payload.client_key) invariant(payload.client_key === app.clientId, 'WEBHOOK_CLIENT', 'Sai ứng dụng.', 401);
    const hash = hashToken(app.workspaceId + ':' + app.version + ':' + raw);
    await tx.webhookEvent.upsert({ where: { hash }, create: { platform: 'tiktok', workspaceId: app.workspaceId, oauthAppVersion: app.version, hash, payload: payload as Prisma.InputJsonValue }, update: {} });
  });
  return NextResponse.json({ ok: true });
}

export async function processWebhooks() {
  const events = await db.webhookEvent.findMany({ where: { processedAt: null }, take: 50 });
  for (const event of events) await db.$transaction(async tx => {
    if (event.workspaceId) await lockOAuthApp(tx, event.workspaceId, 'tiktok');
    const claimed = await tx.webhookEvent.updateMany({ where: { id: event.id, processedAt: null }, data: { processedAt: new Date() } });
    if (!claimed.count || !event.workspaceId || !event.oauthAppVersion) return;
    const app = await tx.workspaceOAuthApp.findUnique({ where: { workspaceId_platform: { workspaceId: event.workspaceId, platform: 'tiktok' } } });
    if (!app?.encryptedSecret || app.version !== event.oauthAppVersion) return;
    const payload = event.payload as { event: string; user_openid?: string };
    if (!payload.user_openid) return;
    const accounts = await tx.socialAccount.findMany({ where: { workspaceId: event.workspaceId, platform: 'tiktok', remoteId: payload.user_openid, oauthAppVersion: event.oauthAppVersion } });
    for (const account of accounts) {
      if (payload.event === 'authorization.removed') {
        await tx.socialAccount.update({ where: { id: account.id }, data: { disconnectedAt: new Date() } });
        await tx.socialAccountCredential.deleteMany({ where: { socialAccountId: account.id } });
        await tx.publishingJob.updateMany({ where: { socialAccountId: account.id, status: { in: ['READY_TO_PUBLISH', 'AWAITING_APPROVAL'] } }, data: { status: 'CANCELLED' } });
      } else {
        await tx.publishingJob.updateMany({ where: { socialAccountId: account.id, status: { in: ['PLATFORM_PROCESSING', 'AWAITING_USER_POST'] }, remoteId: { not: null } }, data: { updatedAt: new Date(0) } });
      }
    }
  });
}
