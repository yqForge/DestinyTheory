import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { createAIMockState, handleAIMock } from './ai-mocks.mjs';

const base = process.env.UI_BASE_URL || 'http://127.0.0.1:3000';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname));
const executable = process.env.CHROME_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
if (!executable) throw new Error('请设置 CHROME_PATH');
const artifacts = resolve(process.env.UI_ARTIFACT_DIR || '.artifacts/ui');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: executable, headless: process.env.UI_HEADED !== '1' });
const errors: string[] = [];
async function pageAt(width = 390, height = 844) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', error => errors.push(error.message));
  const requests: Record<string, any>[] = [];
  const ai = createAIMockState();
  await page.route('**/*', async route => {
    if (!route.request().url().startsWith(base + '/')) { await route.abort(); return; }
    if (await handleAIMock(route, ai)) return;
    if (new URL(route.request().url()).pathname !== '/api/interpret') { await route.continue(); return; }
    requests.push(route.request().postDataJSON());
    await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"delta":{"text":"候选盘比较测试已完成"}}\n\ndata: [DONE]\n\n' });
  });
  return { page, requests };
}
async function date(page: Page, year: string, month: string, day: string) {
  await page.getByRole('combobox', { name: '出生年份', exact: true }).selectOption(year);
  await page.getByRole('combobox', { name: '出生月份', exact: true }).selectOption(month);
  await page.getByRole('combobox', { name: '出生日期', exact: true }).selectOption(day);
}
async function confirm(page: Page) {
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent?.includes('同意发送') && !b.disabled));
  const button = page.getByRole('button', { name: '同意发送，开始 AI 解读' });
  const box = await button.boundingBox();
  const height = page.viewportSize()!.height;
  assert.ok(box && box.y >= 0 && box.y + box.height <= height, 'consent for a range must also be visible without scrolling the whole chart');
  await button.click();
}

try {
  for (const width of [1440, 390, 320]) {
    const { page, requests } = await pageAt(width, width === 320 ? 568 : 900);
    await page.goto(base + '/chart');
    await page.getByRole('radio', { name: '农历（阴历）', exact: true }).check();
    await date(page, '2000', '1', '1');
    await page.getByRole('radio', { name: '模糊时间段', exact: true }).check();
    await page.getByRole('button', { name: '填入示例：9点–11点' }).click();
    await page.getByRole('combobox', { name: '出生省份', exact: true }).selectOption('北京市');
    await page.getByRole('status', { name: '出生资料预览' }).filter({ hasText: '农历换算公历：2000-02-05' }).waitFor();
    assert.ok((await page.getByRole('status', { name: '出生资料预览' }).innerText()).includes('候选盘 2 张'));
    await page.getByRole('button', { name: /立即起盘/ }).click();
    assert.equal(requests.length, 0);
    await confirm(page);
    await page.getByText('候选盘比较测试已完成', { exact: true }).waitFor();
    const birth = requests[0].chart.birthInfo;
    assert.equal(birth.source.calendar, 'lunar');
    assert.equal(birth.source.timeMode, 'range');
    assert.equal(birth.source.rangeStart, '09:00');
    assert.equal(birth.source.rangeEnd, '11:00');
    assert.equal(birth.source.clockHour, undefined);
    assert.equal(birth.origInput, undefined);
    const strip = page.locator('#ai-pane details[aria-label="模糊时间候选盘"]');
    await strip.locator('summary').click();
    const select = strip.getByRole('combobox');
    assert.equal(await select.locator('option').count(), 2);
    await select.selectOption('1');
    assert.equal(requests.length, 1, 'preview selection must not automatically call the model');
    await strip.locator('summary').click();
    await page.getByRole('textbox', { name: '向 AI 提问' }).fill('比较两个候选时辰的共同点与差异');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
    assert.equal(requests.at(-1)!.chart.birthInfo.hour, 5);
    await page.screenshot({ path: `${artifacts}/lunar-range-${width}.png` });
    await page.getByRole('button', { name: /重新起盘/ }).click();
    assert.equal(await page.getByRole('radio', { name: '农历（阴历）', exact: true }).isChecked(), true);
    assert.equal(await page.getByLabel('开始时间', { exact: true }).inputValue(), '09:00');
    assert.equal(await page.getByRole('combobox', { name: '出生年份', exact: true }).inputValue(), '2000');
    await page.close();
    console.log(`✓ ${width}px：农历换算、经度下多候选、首屏确认、切换预览、AI 保留范围及返回修改`);
  }
  {
    const { page } = await pageAt();
    await page.goto(base + '/chart');
    await page.getByRole('radio', { name: '农历（阴历）', exact: true }).check();
    await date(page, '2023', '2', '1');
    await page.getByRole('checkbox', { name: '这是闰月出生' }).check();
    await page.getByRole('status', { name: '出生资料预览' }).filter({ hasText: '2023-03-22' }).waitFor();
    assert.equal(await page.getByRole('combobox', { name: '出生日期', exact: true }).locator('option[value="30"]').count(), 0);
    await page.getByRole('combobox', { name: '出生月份', exact: true }).selectOption('3');
    await page.getByRole('button', { name: /立即起盘/ }).click();
    await page.getByRole('alert').filter({ hasText: '农历日期不存在' }).waitFor();
    await page.getByRole('checkbox', { name: '这是闰月出生' }).uncheck();
    await page.getByRole('radio', { name: '模糊时间段', exact: true }).check();
    await page.getByLabel('开始时间', { exact: true }).fill('23:30');
    await page.getByLabel('结束时间', { exact: true }).fill('01:30');
    await page.getByRole('button', { name: /立即起盘/ }).click();
    await page.getByRole('alert').filter({ hasText: '跨午夜' }).waitFor();
    await page.getByRole('checkbox', { name: '结束在次日（跨午夜）' }).check();
    await page.getByRole('button', { name: /立即起盘/ }).click();
    await confirm(page);
    await page.getByRole('button', { name: /重新起盘/ }).click();
    await page.getByRole('radio', { name: '完全不详', exact: true }).check();
    await page.getByRole('button', { name: /立即起盘/ }).click();
    await page.getByText(/AI 不解读占位盘/).waitFor();
    assert.equal(await page.getByRole('button', { name: '同意发送，开始 AI 解读' }).count(), 0);
    await page.close();
    console.log('✓ 闰月/小月天数、非法闰月拒绝、跨午夜确认、完全未知不启动 AI');
  }

  for (const width of [1440, 390]) {
    const { page } = await pageAt(width, 900);
    // Real incremental ReadableStream in the browser, not a fully buffered mock response.
    await page.addInitScript({ content: `(() => {
      const original = window.fetch.bind(window);
      let controller = null;
      window.__streamPosts = [];
      window.__emitText = text => controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({delta:{text}})+'\\n\\n'));
      window.__endText = () => { controller.enqueue(new TextEncoder().encode('data: [DONE]\\n\\n')); controller.close(); };
      window.fetch = (input, init) => {
        if (String(input).endsWith('/api/interpret') && init && init.method === 'POST') {
          window.__streamPosts.push(JSON.parse(init.body));
          const stream = new ReadableStream({ start(value) { controller = value; }, cancel() {} });
          return Promise.resolve(new Response(stream, {headers:{'Content-Type':'text/event-stream'}}));
        }
        return original(input, init);
      };
    })();` });
    await page.goto(base + '/chart');
    await date(page, '2000', '2', '5');
    await page.getByRole('button', { name: /立即起盘/ }).click();
    await confirm(page);
    const log = page.getByRole('log', { name: '解读记录' });
    const emit = async (text: string) => page.evaluate(text => (window as any).__emitText(text), text);
    const atBottom = () => page.waitForFunction(() => { const el = document.querySelector('[role="log"]')!; return el.scrollHeight - el.scrollTop - el.clientHeight <= 2; });
    await emit('阅读位置测试\n' + Array.from({ length: 80 }, (_, i) => `第 ${i + 1} 行：这里是用于阅读测试的早期正文。`).join('\n') + '\n');
    await atBottom();
    await log.hover();
    await page.mouse.wheel(0, -700);
    await page.waitForFunction(() => { const el = document.querySelector('[role="log"]')!; return el.scrollHeight - el.scrollTop - el.clientHeight > 200; });
    await log.focus();
    const before = await log.evaluate(el => el.scrollTop);
    for (let i = 0; i < 10; i++) { await emit(`继续生成的新内容 ${i}\n`); await page.waitForTimeout(35); }
    assert.ok(Math.abs((await log.evaluate(el => el.scrollTop)) - before) < 3, 'stream updates must not steal the reading position');
    assert.equal(await log.evaluate(el => document.activeElement === el), true, 'new content must not steal focus');
    const jump = page.getByRole('button', { name: '有新内容 · 回到底部 ↓' });
    await jump.waitFor();
    await page.screenshot({ path: `${artifacts}/reading-paused-${width}.png` });
    await jump.click();
    await atBottom();
    await emit('点击回到底部后继续跟随\n');
    await atBottom();
    await log.hover();
    await page.mouse.wheel(0, -500);
    await page.waitForFunction(() => { const el = document.querySelector('[role="log"]')!; return el.scrollHeight - el.scrollTop - el.clientHeight > 100; });
    await emit('再次暂停\n');
    await jump.waitFor();
    await page.mouse.wheel(0, 100000);
    await atBottom();
    await emit('手动滚到底后自动跟随\n');
    await atBottom();
    await page.evaluate(() => (window as any).__endText());
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
    await log.hover();
    await page.mouse.wheel(0, -600);
    await page.waitForFunction(() => { const el = document.querySelector('[role="log"]')!; return el.scrollHeight - el.scrollTop - el.clientHeight > 100; });
    await page.getByRole('textbox', { name: '向 AI 提问' }).fill('主动发送新问题后恢复跟随');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await atBottom();
    await emit('新问题回复\n');
    await atBottom();
    await page.evaluate(() => (window as any).__endText());
    await page.close();
    console.log(`✓ ${width}px：逐片生成中向上阅读保持位置/焦点、未读提示、点击/手动回底恢复、新问题主动跟随`);
  }
  assert.deepEqual(errors, []);
  console.log('农历、模糊时间段及智能滚动浏览器回归全部通过；均为虚构资料和模拟模型，无真实 AI 请求。');
} finally { await browser.close(); }
