import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { PrismaClient } from '@prisma/client';

loadEnvFile('.env');
const db = new PrismaClient(), users: string[] = [], workspaces: string[] = [];
test.afterAll(async () => {
  await db.oAuthState.deleteMany({ where: { workspaceId: { in: workspaces } } });
  for (const id of workspaces) await db.workspace.delete({ where: { id } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

test('owners configure separate apps in their studios; secrets stay hidden and editors cannot configure apps', async ({ page, browser }) => {
  const headers = { Origin: 'http://localhost:3000' }, errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  expect((await page.request.post('/api/auth/register', { headers, data: { email: randomUUID() + '@test.invalid', password: 'Test-password-12345', name: 'TEST OAuth Owner A' } })).ok()).toBe(true);
  const a = await (await page.request.get('/api/auth/me')).json(); users.push(a.userId); workspaces.push(a.workspaceId);
  await page.goto('/?view=connections');
  await expect(page.getByRole('heading', { name: 'Kết nối nền tảng', exact: true })).toBeVisible();
  await page.getByLabel('YouTube Client ID', { exact: true }).fill('test-youtube-a.apps.googleusercontent.com');
  await page.getByLabel('YouTube Client Secret', { exact: true }).fill('test-youtube-secret-a');
  await page.getByRole('button', { name: 'Lưu cấu hình YouTube', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu cấu hình YouTube' })).toBeVisible();
  await expect(page.getByLabel('YouTube Client Secret', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Kết nối YouTube', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Redirect URI YouTube', { exact: true })).toHaveValue('http://localhost:3000/api/integrations/youtube/callback');
  await page.getByLabel('TikTok Client Key', { exact: true }).fill('test-tiktok-a');
  await page.getByLabel('TikTok Client Secret', { exact: true }).fill('test-tiktok-secret-a');
  await page.getByRole('button', { name: 'Lưu cấu hình TikTok', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu cấu hình TikTok' })).toBeVisible();
  const webhookA = await page.getByLabel('Webhook URL TikTok', { exact: true }).inputValue();
  expect(webhookA).toMatch(/\/api\/webhooks\/tiktok\/\w+$/);
  const sanitized = await (await page.request.get('/api/integrations/youtube/app')).json();
  expect(sanitized.configured).toBe(true);
  expect(JSON.stringify(sanitized)).not.toContain('test-youtube-secret-a');
  const row = await db.workspaceOAuthApp.findUniqueOrThrow({ where: { workspaceId_platform: { workspaceId: a.workspaceId, platform: 'youtube' } } });
  expect(row.encryptedSecret).not.toBe('test-youtube-secret-a');
  await page.getByRole('button', { name: 'Lưu cấu hình YouTube', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu cấu hình YouTube' })).toBeVisible();
  expect((await (await page.request.get('/api/integrations/youtube/app')).json()).version).toBe(sanitized.version);
  await page.screenshot({ path: 'artifacts/ui-oauth-settings-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/ui-oauth-settings-mobile.png', fullPage: true });

  // The actual authorization redirect is intercepted locally, so no provider account is contacted.
  await page.route('https://accounts.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>TEST OAuth destination</h1>' }));
  await page.getByRole('button', { name: 'Kết nối YouTube', exact: true }).click();
  await expect(page).toHaveURL(/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  expect(new URL(page.url()).searchParams.get('client_id')).toBe(sanitized.clientId);
  expect(page.url()).not.toContain('test-youtube-secret-a');

  const other = await browser.newContext({ baseURL: 'http://localhost:3000' });
  try {
    expect((await other.request.post('/api/auth/register', { headers, data: { email: randomUUID() + '@test.invalid', password: 'Test-password-12345', name: 'TEST OAuth Owner B' } })).ok()).toBe(true);
    const b = await (await other.request.get('/api/auth/me')).json(); users.push(b.userId); workspaces.push(b.workspaceId);
    const second = await other.newPage(); second.on('pageerror', error => errors.push(error.message));
    await second.goto('/?view=connections');
    await expect(second.getByLabel('YouTube Client ID', { exact: true })).toHaveValue('');
    await second.getByLabel('TikTok Client Key', { exact: true }).fill('test-tiktok-b');
    await second.getByLabel('TikTok Client Secret', { exact: true }).fill('test-tiktok-secret-b');
    await second.getByRole('button', { name: 'Lưu cấu hình TikTok', exact: true }).click();
    await expect(second.getByRole('status').filter({ hasText: 'Đã lưu cấu hình TikTok' })).toBeVisible();
    expect(await second.getByLabel('Webhook URL TikTok', { exact: true }).inputValue()).not.toBe(webhookA);
    const foreignQuery = await (await other.request.get('/api/integrations/tiktok/app?workspaceId=' + a.workspaceId)).json();
    expect(foreignQuery.clientId).toBe('test-tiktok-b');
    second.once('dialog', dialog => dialog.accept());
    await second.getByRole('button', { name: 'Xóa cấu hình TikTok', exact: true }).click();
    await expect(second.getByRole('status').filter({ hasText: 'Đã xóa cấu hình TikTok' })).toBeVisible();
    expect((await (await page.request.get('/api/integrations/tiktok/app')).json()).clientId).toBe('test-tiktok-a');
    await db.workspaceMember.create({ data: { workspaceId: a.workspaceId, userId: b.userId, role: 'EDITOR' } });
    expect((await other.request.post('/api/workspaces/' + a.workspaceId, { headers, data: {} })).ok()).toBe(true);
    await second.goto('/?view=connections');
    await expect(second.getByText('Chủ sở hữu studio quản lý cấu hình ứng dụng và kết nối tài khoản.')).toHaveCount(2);
    await expect(second.getByLabel('YouTube Client ID', { exact: true })).toHaveCount(0);
    expect((await other.request.get('/api/integrations/youtube/app')).status()).toBe(403);
    expect((await other.request.put('/api/integrations/youtube/app', { headers, data: { clientId: 'bad', clientSecret: 'bad', expectedVersion: sanitized.version } })).status()).toBe(403);
    expect((await other.request.delete('/api/integrations/youtube/app', { headers, data: { expectedVersion: sanitized.version, confirmDisconnect: true } })).status()).toBe(403);
    expect((await page.request.put('/api/integrations/youtube/app', { headers: { Origin: 'https://wrong-origin.invalid' }, data: { clientId: sanitized.clientId, expectedVersion: sanitized.version } })).status()).toBe(403);
  } finally { await other.close(); }
  expect(errors).toEqual([]);
});

test('configuration changes survive reload and stale browser forms cannot overwrite a newer version', async ({ page, context }) => {
  const headers = { Origin: 'http://localhost:3000' };
  await page.request.post('/api/auth/register', { headers, data: { email: randomUUID() + '@test.invalid', password: 'Test-password-12345', name: 'TEST OAuth concurrency' } });
  const actor = await (await page.request.get('/api/auth/me')).json(); users.push(actor.userId); workspaces.push(actor.workspaceId);
  await page.goto('/?view=connections');
  await page.getByLabel('YouTube Client ID', { exact: true }).fill('test-client');
  await page.getByLabel('YouTube Client Secret', { exact: true }).fill('test-initial-secret');
  await page.getByRole('button', { name: 'Lưu cấu hình YouTube', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đã lưu cấu hình YouTube' })).toBeVisible();
  const stale = await context.newPage();
  await stale.goto('/?view=connections');
  await stale.locator('summary').filter({ hasText: 'Cấu hình ứng dụng YouTube' }).click();
  await expect(stale.getByLabel('YouTube Client ID', { exact: true })).toHaveValue('test-client');
  await expect(stale.getByLabel('YouTube Client Secret', { exact: true })).toHaveValue('');
  await page.getByLabel('YouTube Client Secret', { exact: true }).fill('test-rotated-secret');
  await page.getByRole('button', { name: 'Lưu cấu hình YouTube', exact: true }).click();
  await expect.poll(async () => (await (await page.request.get('/api/integrations/youtube/app')).json()).version).toBe(2);
  await stale.getByLabel('YouTube Client Secret', { exact: true }).fill('test-stale-secret');
  await stale.getByRole('button', { name: 'Lưu cấu hình YouTube', exact: true }).click();
  await expect(stale.getByRole('alert').filter({ hasText: 'Cấu hình đã thay đổi' })).toBeVisible();
  await stale.close();
  await page.reload();
  await page.locator('summary').filter({ hasText: 'Cấu hình ứng dụng YouTube' }).click();
  await expect(page.getByLabel('YouTube Client ID', { exact: true })).toHaveValue('test-client');
  await expect(page.getByLabel('YouTube Client Secret', { exact: true })).toHaveValue('');
  expect((await (await page.request.get('/api/integrations/youtube/app')).json()).version).toBe(2);
});
