import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Locator, type Page } from 'playwright-core';
import { createAIMockState, handleAIMock } from './ai-mocks.mjs';

const base = process.env.UI_BASE_URL || 'http://127.0.0.1:3000';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname), 'UI tests must run against a local service');
const executable = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(existsSync);
if (!executable) throw new Error('请设置 CHROME_PATH 为本机 Chrome / Chromium 可执行文件路径。');
const artifacts = resolve(process.env.UI_ARTIFACT_DIR || '.artifacts/ui');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: executable, headless: process.env.UI_HEADED !== '1' });
const failures: string[] = [];
type Mode = 'ok' | 'http-error' | 'stream-error' | 'hold';
interface Payload { consent: boolean; messages: { role: string; content: string }[] }

async function idle(page: Page) {
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).some(b => b.textContent === '停止生成'));
}
async function clickableInViewport(locator: Locator, label: string) {
  await locator.waitFor({ state: 'visible' });
  const result = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight,
      hit: !!hit && (hit === element || element.contains(hit)) };
  });
  assert.ok(result.x >= -1 && result.y >= -1 && result.right <= result.width + 1 && result.bottom <= result.height + 1,
    `${label} outside viewport: ${JSON.stringify(result)}`);
  assert.ok(result.hit, `${label} is covered or clipped`);
  await locator.click({ trial: true }); // Real pointer actionability, not DOM .click().
}
async function fixture(width: number, height: number, configFailure = false) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width === 734 ? 2 : 1 });
  page.on('pageerror', error => failures.push(error.message));
  const ai = createAIMockState();
  ai.modelFailure = configFailure;
  const state = { mode: 'ok' as Mode, ai, get configFailure() { return !!ai.modelFailure; }, set configFailure(value: boolean) { ai.modelFailure = value; },
    get gets() { return ai.modelGets.length; }, requests: [] as Payload[] };
  await page.route('**/*', async route => {
    const request = route.request();
    if (!request.url().startsWith(base + '/')) { await route.abort(); return; }
    if (await handleAIMock(route, state.ai)) return;
    if (new URL(request.url()).pathname !== '/api/interpret') { await route.continue(); return; }
    if (request.method() !== 'POST') {
      failures.push(`unexpected ${request.method()} ${request.url()}`);
      await route.fulfill({ status: 405, json: { error: 'unexpected method' } }); return;
    }
    const payload = request.postDataJSON() as Payload;
    assert.equal(payload.consent, true);
    assert.equal(payload.messages.at(-1)?.role, 'user');
    state.requests.push(payload);
    const mode = state.mode;
    if (mode === 'http-error') {
      await route.fulfill({ status: 429, json: { error: '模拟：模型限流，请重试。' } }); return;
    }
    if (mode === 'hold') await new Promise(resolve => setTimeout(resolve, 1200));
    const text = mode === 'stream-error' ? '已收到的部分正文'
      : `浏览器测试答复 ${state.requests.length}\n` + '这是一段用于验证独立滚动和输入框可见性的虚构解读。\n'.repeat(65);
    const body = `data: ${JSON.stringify({ delta: { text } })}\n\n` + (mode === 'stream-error'
      ? `data: ${JSON.stringify({ error: '模拟：生成中断，正文不完整。' })}\n\n` : 'data: [DONE]\n\n');
    await route.fulfill({ contentType: 'text/event-stream; charset=utf-8', body }).catch(() => {}); // cancellation is expected in the hold case
  });
  await page.goto(`${base}/chart`);
  // Synthetic birth data only. Playwright operates real form controls and pointer clicks.
  await page.locator('form select').nth(0).selectOption('2000');
  await page.locator('form select').nth(1).selectOption('2');
  await page.locator('form select').nth(2).selectOption('5');
  await page.getByRole('button', { name: /立即起盘/ }).click();
  await page.getByRole('heading', { name: 'AI 命盘解读', exact: true }).waitFor();
  return { page, state };
}

try {
  for (const [width, height] of [[1440, 900], [1024, 768], [734, 900], [390, 844], [320, 568]]) {
    const { page, state } = await fixture(width, height);
    const confirm = page.getByRole('button', { name: '同意发送，开始 AI 解读' });
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent?.includes('同意发送') && !b.disabled));
    assert.equal(state.requests.length, 0);
    await clickableInViewport(confirm, `${width}: consent`);
    assert.ok(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--t-gold').trim()));
    await page.waitForTimeout(1000); // Let the chart's staggered entrance animation settle for screenshots.
    await page.screenshot({ path: `${artifacts}/consent-${width}.png` });
    await confirm.click();
    await page.getByText('浏览器测试答复 1', { exact: true }).waitFor();
    await idle(page);
    const question = page.getByRole('textbox', { name: '向 AI 提问' });
    const send = page.getByRole('button', { name: '发送', exact: true });
    await clickableInViewport(question, `${width}: question`);
    await question.fill('请用一句话分析事业方向');
    await clickableInViewport(send, `${width}: send`);
    const log = page.getByRole('log', { name: '解读记录' });
    assert.ok(await log.evaluate(el => el.scrollHeight > el.clientHeight + 100), 'long responses must scroll inside the panel');
    await question.press('Enter');
    await page.getByText('浏览器测试答复 2', { exact: true }).waitFor();
    await idle(page);
    assert.equal(state.requests[1].messages.at(-1)?.content, '请用一句话分析事业方向');
    await page.getByRole('button', { name: '事业', exact: true }).click();
    await page.getByText('浏览器测试答复 3', { exact: true }).waitFor();
    await idle(page);
    assert.ok(state.requests[2].messages.at(-1)?.content.includes('事业'));
    await clickableInViewport(question, `${width}: question after long history`);
    if (width < 1024) {
      await page.getByRole('button', { name: '查看命盘', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: '本命', exact: true }).count(), 1, 'one functional time navigation only');
      await page.getByRole('button', { name: 'AI 解读 / 提问', exact: true }).click();
      await clickableInViewport(question, `${width}: switching back retains composer`);
      assert.equal(state.requests.length, 3);
      assert.equal(await confirm.count(), 0, 'switching panes must not reset consent');
    }
    await page.screenshot({ path: `${artifacts}/conversation-${width}.png` });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await clickableInViewport(question, `${width}: light theme question`);
    await page.screenshot({ path: `${artifacts}/light-${width}.png` });
    console.log(`✓ ${width}×${height}: 首屏确认、真实点击、Enter 追问、主题切换、长回复独立滚动、深浅主题`);
    await page.close();
  }

  const { page, state } = await fixture(390, 844, true);
  await page.getByRole('button', { name: '重新检测连接' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '同意发送，开始 AI 解读' }).isDisabled(), true);
  state.configFailure = false;
  const getsBeforeRetry = state.gets;
  await page.getByRole('button', { name: '重新检测连接' }).click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent?.includes('同意发送') && !b.disabled));
  assert.ok(state.gets > getsBeforeRetry); // React Strict Mode may perform an extra initial GET.
  state.mode = 'http-error';
  await page.getByRole('button', { name: '同意发送，开始 AI 解读' }).click();
  await page.getByRole('alert').filter({ hasText: '模拟：模型限流' }).waitFor();
  await clickableInViewport(page.getByRole('button', { name: '重新尝试', exact: true }), 'retry after HTTP error');
  const failedMessages = state.requests.at(-1)!.messages;
  state.mode = 'ok';
  await page.getByRole('button', { name: '重新尝试', exact: true }).click();
  await page.getByText('浏览器测试答复 2', { exact: true }).waitFor();
  await idle(page);
  assert.deepEqual(state.requests.at(-1)!.messages, failedMessages, 'retry must not duplicate the user question');

  const question = page.getByRole('textbox', { name: '向 AI 提问' });
  await question.fill('第一行');
  await question.press('Shift+Enter');
  await question.pressSequentially('second line');
  assert.ok((await question.inputValue()).includes('\n'));
  const beforeComposition = state.requests.length;
  await question.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  assert.equal(state.requests.length, beforeComposition, 'IME confirmation must not submit');
  state.mode = 'stream-error';
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '正文不完整' }).waitFor();
  await page.getByText('已收到的部分正文', { exact: true }).waitFor();
  await clickableInViewport(question, 'composer after stream error');

  state.mode = 'hold';
  await question.fill('取消生成测试');
  const beforeCancel = state.requests.length;
  await question.press('Enter');
  await page.waitForFunction(() => document.querySelector('[aria-busy="true"]') !== null);
  await page.getByRole('button', { name: '停止生成', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '已停止生成' }).waitFor();
  state.mode = 'ok';
  await question.fill('停止之后继续提问');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await idle(page);
  assert.ok(state.requests.length >= beforeCancel + 1);
  assert.equal(state.requests.at(-1)?.messages.at(-1)?.content, '停止之后继续提问');
  await clickableInViewport(question, 'composer after stop and new question');
  await page.screenshot({ path: `${artifacts}/recovery-mobile.png` });
  await page.close();
  assert.deepEqual(failures, [], 'No browser runtime errors');
  console.log('✓ 配置重检、HTTP 错误重试、流中断保留正文、Shift+Enter、中文输入法确认、停止及恢复通过');
  console.log(`浏览器截图：${artifacts}（全部虚构资料；AI 响应均模拟，无真实模型调用）`);
} finally { await browser.close(); }
