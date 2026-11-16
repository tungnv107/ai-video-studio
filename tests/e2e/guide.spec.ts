import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadEnvFile } from 'node:process';
import { PrismaClient } from '@prisma/client';

loadEnvFile('.env');
const db = new PrismaClient();
let userId = '', workspaceId = '', mediaKey = '';
test.afterAll(async () => {
  if (mediaKey) {
    const { deleteAsset } = await import('../../src/server/storage');
    await deleteAsset(workspaceId, mediaKey);
  }
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

test('public guide supports search, anchors, troubleshooting and mobile themes without authentication', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto('/guide');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Hướng dẫn sử dụng · AI Video Studio');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Từ ý tưởng đầu tiên');
  await expect(page.locator('article.guide-article')).toHaveCount(10);
  const brokenAnchors = await page.locator('a[href^="#"]').evaluateAll(links => links.map(link => link.getAttribute('href')!.slice(1)).filter(id => !document.getElementById(id)));
  expect(brokenAnchors).toEqual([]);
  await page.screenshot({ path: 'artifacts/ui-guide-desktop.png' });

  const search = page.getByRole('searchbox', { name: 'Tìm trong hướng dẫn' });
  await search.fill('parallax');
  await expect(page.locator('article.guide-article')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Kịch bản, storyboard và trợ lý AI' })).toBeVisible();
  await search.fill('thuong hieu');
  await expect(page.getByRole('heading', { name: 'Thương hiệu, giọng đọc và tài sản' })).toBeAttached();
  await search.fill('khongtimthay987654');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy nội dung phù hợp' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Mục lục hướng dẫn' }).getByRole('link', { name: /Lịch nội dung và chiến dịch/ }).click();
  await expect(search).toHaveValue('');
  await expect(page).toHaveURL(/#lich$/);
  await expect(page.getByRole('heading', { name: 'Lịch nội dung và chiến dịch' })).toBeInViewport();

  await page.getByRole('navigation').getByRole('link', { name: 'Xử lý sự cố' }).click();
  const question = page.locator('details').filter({ hasText: 'Video đứng ở Trong hàng đợi hoặc Đã lên lịch?' });
  await question.locator('summary').click();
  await expect(question.locator('p')).toBeVisible();
  await page.screenshot({ path: 'artifacts/ui-guide-troubleshooting.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/guide#bat-dau');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/ui-guide-mobile.png' });
  await page.getByRole('button', { name: 'Đổi giao diện' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/ui-guide-light-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('login links directly to the public user guide', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Hướng dẫn sử dụng Video Studio' }).click();
  await expect(page).toHaveURL('/guide');
  await page.getByRole('link', { name: 'Vào studio', exact: true }).click();
  await expect(page).toHaveURL('/login');
});

test('studio plays generated clips and selects the available TikTok upload mode', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const headers = { Origin: 'http://localhost:3000' };
  expect((await page.request.post('/api/auth/register', { headers, data: { email: randomUUID() + '@test.invalid', password: 'Test-password-12345', name: 'TEST Guide' } })).ok()).toBe(true);
  const actor = await (await page.request.get('/api/auth/me')).json();
  userId = actor.userId; workspaceId = actor.workspaceId;
  const channel = await db.contentChannel.create({ data: { workspaceId, name: 'TEST guide channel', topic: 'Test' } });
  const clipPath = testInfo.outputPath('guide-fixture.mp4');
  await mkdir(dirname(clipPath), { recursive: true });
  const { runMedia } = await import('../../src/render/ffmpeg');
  await runMedia('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=270x480:rate=24', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', clipPath]);
  const bytes = await readFile(clipPath);
  mediaKey = workspaceId + '/guide-test.mp4';
  const { putAsset } = await import('../../src/server/storage');
  await putAsset(mediaKey, bytes, 'video/mp4');
  const project = await db.videoProject.create({ data: { workspaceId, channelId: channel.id, title: 'TEST guide video', topic: 'Test', topicHash: randomUUID(), status: 'APPROVED', outputKey: mediaKey, qaScore: 100 } });
  await db.generatedAsset.create({ data: { workspaceId, projectId: project.id, revision: 0, sceneOrder: 1, kind: 'VIDEO', storageKey: mediaKey, mimeType: 'video/mp4', bytes: bytes.length } });
  const account = await db.socialAccount.create({ data: { workspaceId, platform: 'tiktok', remoteId: randomUUID(), displayName: 'TEST TikTok inbox', scopes: ['video.upload'] } });

  let offline = true;
  // Only simulate UI capabilities. Never connect to or submit a post to a real social account.
  let directEnabled = false, creatorRequests = 0;
  await page.route('**/api/bootstrap', async route => {
    if (offline) { await route.fulfill({ status: 503, json: { error: { message: 'TEST temporary connection failure' } } }); return; }
    const response = await route.fetch();
    const value = await response.json();
    value.capabilities.publishing = true;
    value.capabilities.tiktokDirect = directEnabled;
    await route.fulfill({ response, json: value });
  });
  await page.route('**/api/integrations/tiktok/creator?*', async route => { creatorRequests++; await route.fulfill({ json: {} }); });

  await page.goto('/?view=assets');
  const connectionError = page.getByRole('alert').filter({ hasText: 'TEST temporary connection failure' });
  await expect(connectionError).toBeVisible();
  await expect(page.getByRole('link', { name: 'Hướng dẫn & xử lý sự cố' })).toHaveAttribute('href', '/guide#xu-ly-su-co');
  offline = false;
  await page.getByRole('button', { name: 'Thử tải lại', exact: true }).click();
  await expect(connectionError).toHaveCount(0);
  const clip = page.getByLabel('Clip scene 1', { exact: true });
  await expect(clip).toHaveJSProperty('tagName', 'VIDEO');
  await expect.poll(() => clip.evaluate(element => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
  await clip.evaluate(element => (element as HTMLVideoElement).play());
  await expect.poll(() => clip.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
  await clip.evaluate(element => (element as HTMLVideoElement).pause());
  await page.screenshot({ path: 'artifacts/ui-generated-clip.png' });
  await page.getByRole('link', { name: 'Hướng dẫn sử dụng', exact: true }).click();
  await expect(page).toHaveURL('/guide');

  for (const enabled of [false, true]) {
    directEnabled = enabled;
    await page.goto('/?view=production');
    await page.getByRole('button', { name: /TEST guide video/ }).click();
    await page.getByRole('button', { name: 'Chuẩn bị xuất bản', exact: true }).click();
    await page.getByLabel('Tài khoản đích', { exact: true }).selectOption(account.id);
    await expect(page.getByLabel('Luồng gửi', { exact: true })).toHaveValue('UPLOAD');
    await expect(page.getByLabel('Luồng gửi', { exact: true }).locator('option[value="DIRECT"]')).toBeDisabled();
    await page.getByLabel('Quyền riêng tư', { exact: true }).selectOption('SELF_ONLY');
  }
  expect(creatorRequests).toBe(0);
  expect(await db.publishingJob.count({ where: { projectId: project.id } })).toBe(0);
  expect(errors).toEqual([]);
});
