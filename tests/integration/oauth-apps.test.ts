import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID, createHmac } from 'node:crypto';
import { db, withTenant, closeTenantClients } from '../../src/server/db';
import { type Actor } from '../../src/server/auth';
import { encrypt, decrypt, hashPassword } from '../../src/server/crypto';
import { changeOAuthApp, readOAuthApp, oauthCapabilities, type Platform } from '../../src/server/oauth-apps';
import { startOAuth, finishOAuth, accountToken, disconnectSocialAccount } from '../../src/server/oauth';
import { tiktokWebhook, processWebhooks } from '../../src/server/webhooks';

let a: Actor, b: Actor;
const actors: Actor[] = [];
async function createOwner() {
  const user = await db.user.create({ data: { name: 'TEST OAuth studio', email: randomUUID() + '@test.invalid', passwordHash: hashPassword('test-password-12345'), memberships: { create: { role: 'OWNER', workspace: { create: { name: 'TEST OAuth ' + randomUUID() } } } } }, include: { memberships: true } });
  const actor: Actor = { userId: user.id, workspaceId: user.memberships[0].workspaceId, role: 'OWNER', name: user.name, email: user.email };
  actors.push(actor); return actor;
}
beforeEach(async () => { a = await createOwner(); b = await createOwner(); });
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  await closeTenantClients();
  for (const actor of actors.splice(0)) {
    await db.oAuthState.deleteMany({ where: { workspaceId: actor.workspaceId } });
    await db.workspace.delete({ where: { id: actor.workspaceId } });
    await db.user.delete({ where: { id: actor.userId } });
  }
});
afterAll(async () => { await db.$disconnect(); });
const save = (actor: Actor, platform: Platform, clientId = 'client-' + actor.workspaceId, clientSecret = 'secret-' + actor.workspaceId) => withTenant(actor.workspaceId, () => changeOAuthApp(actor, platform, { clientId, clientSecret, expectedVersion: 0 }));
async function account(actor: Actor, platform: Platform, version: number, remoteId = randomUUID()) {
  return db.socialAccount.create({ data: { workspaceId: actor.workspaceId, platform, remoteId, displayName: 'TEST account', scopes: [], oauthAppVersion: version, credential: { create: { encryptedAccessToken: encrypt('test-access'), encryptedRefreshToken: encrypt('test-refresh'), expiresAt: new Date(Date.now() + 3600000) } } } });
}
async function pendingJob(actor: Actor, accountId: string, status = 'READY_TO_PUBLISH') {
  const channel = await db.contentChannel.create({ data: { workspaceId: actor.workspaceId, name: 'TEST channel', topic: 'Test' } });
  const project = await db.videoProject.create({ data: { workspaceId: actor.workspaceId, channelId: channel.id, title: 'TEST OAuth job', topic: 'Test', topicHash: randomUUID() } });
  return db.publishingJob.create({ data: { projectId: project.id, socialAccountId: accountId, revision: 0, status, settings: {}, idempotencyKey: randomUUID() } });
}
const signedRequest = (raw: string, secret: string) => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request('http://localhost:3000/api/webhooks/tiktok/app', { method: 'POST', headers: { 'tiktok-signature': 't=' + timestamp + ',s=' + createHmac('sha256', secret).update(timestamp + '.' + raw).digest('hex') }, body: raw });
};

it('stores encrypted app credentials under RLS and never returns a secret in configuration DTOs', async () => {
  const appA = await save(a, 'youtube'), appB = await save(b, 'youtube');
  const stored = await db.workspaceOAuthApp.findUniqueOrThrow({ where: { workspaceId_platform: { workspaceId: a.workspaceId, platform: 'youtube' } } });
  expect(stored.encryptedSecret).not.toContain('secret-' + a.workspaceId);
  expect(decrypt(stored.encryptedSecret!)).toBe('secret-' + a.workspaceId);
  expect(JSON.stringify(appA)).not.toContain('secret-' + a.workspaceId);
  expect(appA).not.toHaveProperty('encryptedSecret');
  expect(appA).not.toHaveProperty('clientSecret');
  await withTenant(a.workspaceId, async () => {
    expect((await db.workspaceOAuthApp.findMany()).map(row => row.workspaceId)).toEqual([a.workspaceId]);
    expect(await db.workspaceOAuthApp.findMany({ where: { workspaceId: b.workspaceId } })).toEqual([]);
    await expect(db.workspaceOAuthApp.create({ data: { workspaceId: b.workspaceId, platform: 'tiktok', clientId: 'bad', encryptedSecret: encrypt('bad') } })).rejects.toThrow();
    expect(await readOAuthApp(a, 'youtube')).toEqual(appA);
  });
  expect(appB.clientId).not.toBe(appA.clientId);
  expect(await oauthCapabilities(a.workspaceId)).toEqual({ youtubeOAuth: true, tiktokOAuth: false });
});

it('restricts viewing, updating and clearing app settings to the workspace owner', async () => {
  await save(a, 'youtube');
  for (const role of ['EDITOR', 'REVIEWER', 'VIEWER'] as const) {
    const actor = { ...a, role };
    await expect(readOAuthApp(actor, 'youtube')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(changeOAuthApp(actor, 'youtube', {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(changeOAuthApp(actor, 'youtube', { expectedVersion: 1, confirmDisconnect: true }, true)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  }
});

it('requires a matching secret for new client IDs and refuses stale settings updates', async () => {
  await expect(changeOAuthApp(a, 'youtube', { clientId: 'client', expectedVersion: 0 })).rejects.toMatchObject({ code: 'OAUTH_SECRET_REQUIRED' });
  const app = await save(a, 'youtube');
  await expect(changeOAuthApp(a, 'youtube', { clientId: 'different-client', expectedVersion: app.version })).rejects.toMatchObject({ code: 'OAUTH_SECRET_REQUIRED' });
  await expect(changeOAuthApp(a, 'youtube', { clientId: app.clientId, clientSecret: 'new-secret', expectedVersion: 0 })).rejects.toMatchObject({ code: 'OAUTH_CONFIG_CONFLICT' });
  expect((await readOAuthApp(a, 'youtube')).version).toBe(app.version);
});

it('keeps the current secret, token and version when saving an unchanged client with a blank secret', async () => {
  const app = await save(a, 'youtube'), linked = await account(a, 'youtube', app.version);
  const unchanged = await changeOAuthApp(a, 'youtube', { clientId: app.clientId, clientSecret: '', expectedVersion: app.version });
  expect(unchanged.version).toBe(app.version);
  expect(unchanged.connectedAccounts).toBe(1);
  expect(await accountToken(linked.id)).toBe('test-access');
});

it('rotates only one studio/platform, invalidates pending OAuth and cancels queued consent', async () => {
  const app = await save(a, 'youtube'), other = await save(b, 'youtube');
  const linked = await account(a, 'youtube', app.version), preserved = await account(b, 'youtube', other.version);
  const job = await pendingJob(a, linked.id);
  const state = new URL(await startOAuth(a, 'youtube')).searchParams.get('state')!;
  const data = { clientId: app.clientId, clientSecret: 'rotated-secret', expectedVersion: app.version };
  await expect(changeOAuthApp(a, 'youtube', data)).rejects.toMatchObject({ code: 'OAUTH_DISCONNECT_CONFIRMATION' });
  const updated = await changeOAuthApp(a, 'youtube', { ...data, confirmDisconnect: true });
  expect(updated.version).toBe(app.version + 1);
  expect(await db.oAuthState.findUnique({ where: { id: state } })).toBeNull();
  expect(await db.socialAccountCredential.findUnique({ where: { socialAccountId: linked.id } })).toBeNull();
  expect((await db.publishingJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('CANCELLED');
  expect(await accountToken(preserved.id)).toBe('test-access');
  await expect(finishOAuth(a, 'youtube', state, 'code')).rejects.toMatchObject({ code: 'OAUTH_STATE' });
});

it('blocks rotation while an upload is active and clears credentials without resetting the version', async () => {
  const app = await save(a, 'tiktok'), linked = await account(a, 'tiktok', app.version), job = await pendingJob(a, linked.id, 'UPLOADING');
  await expect(changeOAuthApp(a, 'tiktok', { expectedVersion: app.version, confirmDisconnect: true }, true)).rejects.toMatchObject({ code: 'OAUTH_UPLOAD_ACTIVE' });
  await db.publishingJob.update({ where: { id: job.id }, data: { status: 'PUBLISHED' } });
  const cleared = await changeOAuthApp(a, 'tiktok', { expectedVersion: app.version, confirmDisconnect: true }, true);
  expect(cleared).toMatchObject({ configured: false, hasSecret: false, clientId: '', webhookUrl: null, version: app.version + 1 });
  expect((await db.workspaceOAuthApp.findUniqueOrThrow({ where: { workspaceId_platform: { workspaceId: a.workspaceId, platform: 'tiktok' } } })).encryptedSecret).toBeNull();
  const recreated = await changeOAuthApp(a, 'tiktok', { clientId: 'new-client', clientSecret: 'new-secret', expectedVersion: cleared.version });
  expect(recreated.version).toBe(cleared.version + 1);
});

it('uses each studio app for authorization, callback and refresh and never falls back to environment credentials', async () => {
  vi.stubEnv('YOUTUBE_CLIENT_ID', 'wrong-global'); vi.stubEnv('YOUTUBE_CLIENT_SECRET', 'wrong-global-secret');
  await expect(startOAuth(a, 'youtube')).rejects.toMatchObject({ code: 'OAUTH_CONFIG' });
  await save(a, 'youtube'); await save(b, 'youtube');
  const requests: URLSearchParams[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).includes('/token')) {
      const params = new URLSearchParams(String(init?.body)); requests.push(params);
      return Response.json({ access_token: 'access-' + params.get('client_id'), refresh_token: 'refresh-' + params.get('client_id'), expires_in: 60, scope: 'test-scope' });
    }
    return Response.json({ items: [{ id: 'same-remote-channel', snippet: { title: 'TEST channel' } }] });
  });
  for (const actor of [a, b]) {
    const url = new URL(await withTenant(actor.workspaceId, () => startOAuth(actor, 'youtube'))), state = url.searchParams.get('state')!;
    expect(url.searchParams.get('client_id')).toBe('client-' + actor.workspaceId);
    expect(url.href).not.toContain('secret-');
    await expect(finishOAuth(actor === a ? b : a, 'youtube', state, 'code')).rejects.toMatchObject({ code: 'OAUTH_STATE' });
    const linked = await withTenant(actor.workspaceId, () => finishOAuth(actor, 'youtube', state, 'code'));
    expect(await accountToken(linked.id)).toBe('access-client-' + actor.workspaceId);
    expect(requests.slice(-2).every(params => params.get('client_id') === 'client-' + actor.workspaceId && params.get('client_secret') === 'secret-' + actor.workspaceId)).toBe(true);
    await expect(finishOAuth(actor, 'youtube', state, 'code')).rejects.toMatchObject({ code: 'OAUTH_STATE' });
  }
  expect(requests).toHaveLength(4);
});

it('rejects a callback if the app is rotated during its remote token exchange', async () => {
  const app = await save(a, 'youtube');
  const state = new URL(await startOAuth(a, 'youtube')).searchParams.get('state')!;
  let entered!: () => void, release!: () => void;
  const waiting = new Promise<void>(resolve => entered = resolve), gate = new Promise<void>(resolve => release = resolve);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (String(url).includes('/token')) { entered(); await gate; return Response.json({ access_token: 'test-access', expires_in: 3600 }); }
    return Response.json({ items: [{ id: 'test', snippet: { title: 'TEST' } }] });
  });
  const result = finishOAuth(a, 'youtube', state, 'code');
  const rejection = expect(result).rejects.toMatchObject({ code: 'OAUTH_CONFIG_CHANGED' });
  await waiting;
  try { await changeOAuthApp(a, 'youtube', { clientId: app.clientId, clientSecret: 'rotated', expectedVersion: app.version }); }
  finally { release(); }
  await rejection;
  expect(await db.socialAccount.count({ where: { workspaceId: a.workspaceId } })).toBe(0);
});

it('binds webhook signature, replay dedupe and revocation to the target studio even with identical app keys', async () => {
  const appA = await save(a, 'tiktok', 'shared-client', 'shared-secret'), appB = await save(b, 'tiktok', 'shared-client', 'shared-secret');
  const remoteId = randomUUID(), linkedA = await account(a, 'tiktok', appA.version, remoteId), linkedB = await account(b, 'tiktok', appB.version, remoteId);
  const appId = new URL(appA.webhookUrl!).pathname.split('/').at(-1);
  expect(appA.webhookUrl).not.toBe(appB.webhookUrl);
  const raw = JSON.stringify({ event: 'authorization.removed', user_openid: remoteId, client_key: 'shared-client' });
  await expect(tiktokWebhook(signedRequest(raw, 'wrong-secret'), appId)).rejects.toMatchObject({ code: 'WEBHOOK_SIGNATURE' });
  await expect(tiktokWebhook(signedRequest(raw, 'shared-secret'))).rejects.toMatchObject({ code: 'WEBHOOK_CONFIG' });
  await tiktokWebhook(signedRequest(raw, 'shared-secret'), appId); await tiktokWebhook(signedRequest(raw, 'shared-secret'), appId);
  expect(await db.webhookEvent.count({ where: { workspaceId: a.workspaceId } })).toBe(1);
  await Promise.all([processWebhooks(), processWebhooks()]);
  expect((await db.socialAccount.findUniqueOrThrow({ where: { id: linkedA.id } })).disconnectedAt).not.toBeNull();
  expect(await accountToken(linkedB.id)).toBe('test-access');
});

it('does not apply a queued webhook from an old app version to a reconnected account', async () => {
  const app = await save(a, 'tiktok'), remoteId = randomUUID();
  const raw = JSON.stringify({ event: 'authorization.removed', user_openid: remoteId, client_key: app.clientId });
  await tiktokWebhook(signedRequest(raw, 'secret-' + a.workspaceId), new URL(app.webhookUrl!).pathname.split('/').at(-1));
  const updated = await changeOAuthApp(a, 'tiktok', { clientId: app.clientId, clientSecret: 'rotated', expectedVersion: app.version });
  const linked = await account(a, 'tiktok', updated.version, remoteId);
  await processWebhooks();
  expect(await accountToken(linked.id)).toBe('test-access');
});

it('revokes TikTok using the connected studio credentials and removes local tokens', async () => {
  const app = await save(a, 'tiktok'); await save(b, 'tiktok');
  const linked = await account(a, 'tiktok', app.version);
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}));
  expect(await disconnectSocialAccount(a, 'tiktok', linked.id)).toMatchObject({ remoteRevoked: true });
  const params = new URLSearchParams(String(fetcher.mock.calls[0][1]?.body));
  expect(params.get('client_key')).toBe(app.clientId);
  expect(params.get('client_secret')).toBe('secret-' + a.workspaceId);
  expect(await db.socialAccountCredential.findUnique({ where: { socialAccountId: linked.id } })).toBeNull();
});
