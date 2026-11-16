import { randomBytes, createHash } from 'node:crypto';
import { db } from './db';
import { encrypt, decrypt } from './crypto';
import { invariant } from '../domain/errors';
import type { Actor } from './auth';
import { platformFetch } from '../providers/social';
import { credentialsFor, lockOAuthApp, oauthRedirectUri, type Platform } from './oauth-apps';
export type { Platform } from './oauth-apps';

export async function startOAuth(actor: Actor, platform: Platform) {
  const state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
  const app = await db.$transaction(async tx => {
    await lockOAuthApp(tx, actor.workspaceId, platform);
    const credentials = credentialsFor(await tx.workspaceOAuthApp.findUnique({ where: { workspaceId_platform: { workspaceId: actor.workspaceId, platform } } }));
    await tx.oAuthState.create({ data: { id: state, workspaceId: actor.workspaceId, userId: actor.userId, platform, verifier: encrypt(verifier), oauthAppVersion: credentials.version, expiresAt: new Date(Date.now() + 600000) } });
    return credentials;
  });
  const params = new URLSearchParams({ response_type: 'code', redirect_uri: oauthRedirectUri(platform), state });
  if (platform === 'youtube') {
    params.set('client_id', app.clientId);
    params.set('scope', 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly');
    params.set('access_type', 'offline'); params.set('prompt', 'consent');
    params.set('code_challenge', createHash('sha256').update(verifier).digest('base64url')); params.set('code_challenge_method', 'S256');
  } else {
    params.set('client_key', app.clientId);
    params.set('scope', 'user.info.basic,video.upload,video.list' + (process.env.TIKTOK_DIRECT_POST_ENABLED === 'true' ? ',video.publish' : ''));
  }
  return (platform === 'youtube' ? 'https://accounts.google.com/o/oauth2/v2/auth?' : 'https://www.tiktok.com/v2/auth/authorize/?') + params;
}

async function tokenRequest(platform: Platform, app: ReturnType<typeof credentialsFor>, params: Record<string, string>) {
  const form = new URLSearchParams({ ...params, [platform === 'youtube' ? 'client_id' : 'client_key']: app.clientId, client_secret: app.secret });
  const response = await platformFetch(platform === 'youtube' ? 'https://oauth2.googleapis.com/token' : 'https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  const tokens = await response.json();
  invariant(typeof tokens.access_token === 'string' && tokens.access_token && Number.isFinite(Number(tokens.expires_in)) && Number(tokens.expires_in) > 0, 'OAUTH_TOKEN', 'OAuth không trả token hoặc thời hạn hợp lệ.', 502);
  return tokens;
}

export async function finishOAuth(actor: Actor, platform: Platform, state: string, code: string) {
  const { app, verifier } = await db.$transaction(async tx => {
    await lockOAuthApp(tx, actor.workspaceId, platform);
    const record = await tx.oAuthState.findUnique({ where: { id: state } });
    invariant(record && record.platform === platform && record.userId === actor.userId && record.workspaceId === actor.workspaceId && record.expiresAt > new Date(), 'OAUTH_STATE', 'OAuth state hết hạn hoặc không hợp lệ.', 403);
    const app = credentialsFor(await tx.workspaceOAuthApp.findUnique({ where: { workspaceId_platform: { workspaceId: actor.workspaceId, platform } } }));
    invariant(record.oauthAppVersion === app.version, 'OAUTH_CONFIG_CHANGED', 'Cấu hình OAuth đã đổi. Bắt đầu kết nối lại.', 409);
    const consumed = await tx.oAuthState.deleteMany({ where: { id: state, expiresAt: { gt: new Date() } } });
    invariant(consumed.count === 1, 'OAUTH_REPLAY', 'Callback đã sử dụng.', 409);
    return { app, verifier: decrypt(record.verifier) };
  });
  const tokens = await tokenRequest(platform, app, { grant_type: 'authorization_code', code, redirect_uri: oauthRedirectUri(platform), ...(platform === 'youtube' ? { code_verifier: verifier } : {}) });
  let remoteId: string, displayName: string;
  if (platform === 'youtube') {
    const response = await platformFetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: 'Bearer ' + tokens.access_token } }), data = await response.json();
    invariant(data.items?.[0], 'YOUTUBE_CHANNEL', 'Tài khoản không có kênh YouTube.', 400);
    remoteId = data.items[0].id; displayName = data.items[0].snippet.title;
  } else {
    const response = await platformFetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', { headers: { Authorization: 'Bearer ' + tokens.access_token } }), data = await response.json();
    invariant(data.data?.user?.open_id, 'TIKTOK_ACCOUNT', 'Không đọc được tài khoản TikTok.', 502);
    remoteId = data.data.user.open_id; displayName = data.data.user.display_name;
  }
  const scopes = String(tokens.scope || '').split(/[ ,]+/).filter(Boolean);
  const credential = { encryptedAccessToken: encrypt(tokens.access_token), encryptedRefreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null, expiresAt: new Date(Date.now() + Number(tokens.expires_in) * 1000) };
  return db.$transaction(async tx => {
    await lockOAuthApp(tx, actor.workspaceId, platform);
    const current = await tx.workspaceOAuthApp.findUnique({ where: { workspaceId_platform: { workspaceId: actor.workspaceId, platform } } });
    invariant(current?.encryptedSecret && current.version === app.version && current.clientId === app.clientId, 'OAUTH_CONFIG_CHANGED', 'Cấu hình OAuth đã đổi trong lúc kết nối. Hãy kết nối lại.', 409);
    return tx.socialAccount.upsert({
      where: { workspaceId_platform_remoteId: { workspaceId: actor.workspaceId, platform, remoteId } },
      create: { workspaceId: actor.workspaceId, platform, remoteId, displayName, scopes, oauthAppVersion: app.version, credential: { create: credential } },
      update: { displayName, scopes, oauthAppVersion: app.version, disconnectedAt: null, credential: { upsert: { create: credential, update: credential } } },
      select: { id: true, displayName: true },
    });
  });
}

export async function accountToken(id: string) {
  const owner = await db.socialAccount.findUnique({ where: { id }, select: { workspaceId: true, platform: true } });
  invariant(owner, 'DISCONNECTED', 'Không tìm thấy tài khoản.', 409);
  return db.$transaction(async tx => {
    await lockOAuthApp(tx, owner.workspaceId, owner.platform);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'oauth:' + id}))`;
    const account = await tx.socialAccount.findUnique({ where: { id }, include: { credential: true } });
    invariant(account && !account.disconnectedAt && account.credential, 'DISCONNECTED', 'Tài khoản chưa kết nối hoặc đã thu hồi quyền.', 409);
    const app = await tx.workspaceOAuthApp.findUnique({ where: { workspaceId_platform: owner } });
    if (account.oauthAppVersion !== null) invariant(app?.encryptedSecret && app.version === account.oauthAppVersion, 'OAUTH_RECONNECT', 'Cấu hình OAuth đã đổi; cần kết nối lại tài khoản.', 409);
    // Existing tokens from before the upgrade remain usable until they expire or the owner changes configuration.
    if (account.credential.expiresAt > new Date(Date.now() + 120000)) return decrypt(account.credential.encryptedAccessToken);
    invariant(app?.encryptedSecret && account.oauthAppVersion === app.version, 'OAUTH_RECONNECT', 'Lưu cấu hình ứng dụng của studio rồi kết nối lại tài khoản.', 409);
    invariant(account.credential.encryptedRefreshToken, 'TOKEN_EXPIRED', 'Token hết hạn; cần kết nối lại.', 401);
    const tokens = await tokenRequest(account.platform as Platform, credentialsFor(app), { grant_type: 'refresh_token', refresh_token: decrypt(account.credential.encryptedRefreshToken) });
    await tx.socialAccountCredential.update({ where: { socialAccountId: id }, data: { encryptedAccessToken: encrypt(tokens.access_token), ...(tokens.refresh_token ? { encryptedRefreshToken: encrypt(tokens.refresh_token) } : {}), expiresAt: new Date(Date.now() + Number(tokens.expires_in) * 1000) } });
    return String(tokens.access_token);
  }, { timeout: 130000 });
}

export async function disconnectSocialAccount(actor: Actor, platform: Platform, id: string) {
  const snapshot = await db.$transaction(async tx => {
    await lockOAuthApp(tx, actor.workspaceId, platform);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'oauth:' + id}))`;
    const account = await tx.socialAccount.findFirst({ where: { id, workspaceId: actor.workspaceId, platform }, include: { credential: true } });
    invariant(account, 'NOT_FOUND', 'Không tìm thấy tài khoản.', 404);
    const app = await tx.workspaceOAuthApp.findUnique({ where: { workspaceId_platform: { workspaceId: actor.workspaceId, platform } } });
    await tx.socialAccount.update({ where: { id }, data: { disconnectedAt: new Date() } });
    await tx.publishingJob.updateMany({ where: { socialAccountId: id, status: { in: ['READY_TO_PUBLISH', 'AWAITING_APPROVAL'] } }, data: { status: 'CANCELLED' } });
    await tx.socialAccountCredential.deleteMany({ where: { socialAccountId: id } });
    return { account, app };
  });
  let remoteRevoked = false;
  if (snapshot.account.credential) try {
    const token = decrypt(snapshot.account.credential.encryptedAccessToken);
    const credentials = platform === 'tiktok' ? credentialsFor(snapshot.app) : null;
    if (platform === 'tiktok') invariant(snapshot.account.oauthAppVersion === credentials?.version, 'OAUTH_RECONNECT', 'Không dùng secret mới để thu hồi token của ứng dụng cũ.', 409);
    const params = new URLSearchParams(credentials ? { client_key: credentials.clientId, client_secret: credentials.secret, token } : { token });
    await platformFetch(platform === 'youtube' ? 'https://oauth2.googleapis.com/revoke' : 'https://open.tiktokapis.com/v2/oauth/revoke/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
    remoteRevoked = true;
  } catch { /* Local revocation is authoritative even when the remote endpoint is unavailable. */ }
  return { ok: true, remoteRevoked };
}
