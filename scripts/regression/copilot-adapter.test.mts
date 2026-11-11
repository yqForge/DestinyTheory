import assert from 'node:assert/strict';
import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxThinking, type Context } from '@earendil-works/pi-ai';
import { checkCopilot, createCopilotResponse, type CopilotRuntime } from '../../lib/ai/copilot';
import { getAIConfig } from '../../lib/ai/config';
import { readSseData } from '../../lib/ai/sse';

async function main() {
  const config = getAIConfig({ AI_PROVIDER: 'github-copilot', AI_MODEL: 'test-copilot', AI_REASONING: 'low' });
  assert.ok(config.kind === 'copilot');
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  let captured: Context | undefined;
  const runtime: CopilotRuntime = {
    getModel(provider, id) { assert.equal(provider, 'github-copilot'); assert.equal(id, 'test-copilot'); return faux.getModel(); },
    async checkAuth() { return { type: 'oauth', source: 'test-store' }; },
    streamSimple(model, context, options) {
      captured = context;
      assert.equal(options?.reasoning, 'low');
      assert.equal(options?.cacheRetention, 'none');
      return models.streamSimple(model, context, options);
    },
  };
  await assert.rejects(() => checkCopilot('test-copilot', undefined, { ...runtime, getModel: () => undefined }), /AI_MODEL/);
  await assert.rejects(() => checkCopilot('test-copilot', undefined, { ...runtime, checkAuth: async () => undefined }), /login github-copilot/);
  faux.setResponses([fauxAssistantMessage([fauxThinking('PRIVATE_REASONING'), fauxText('紫微解读正文')])]);
  const history = [{ role: 'user' as const, content: '第一问' }, { role: 'assistant' as const, content: '上一答' }, { role: 'user' as const, content: '继续' }];
  const response = await createCopilotResponse(config, 'TEST_SYSTEM', history, new AbortController().signal, runtime);
  const raw = await response.text();
  assert.ok(raw.includes('紫微解读正文') || raw.includes('紫微'));
  assert.ok(!raw.includes('PRIVATE_REASONING'));
  assert.ok(raw.includes('[DONE]'));
  assert.deepEqual(captured?.tools, []);
  assert.equal(captured?.systemPrompt, 'TEST_SYSTEM');
  assert.equal(captured?.messages.length, 3);
  assert.equal(captured?.messages[1].role, 'assistant');

  faux.setResponses([fauxAssistantMessage([fauxText('部分')], { stopReason: 'length' })]);
  const limited = await createCopilotResponse(config, 'TEST_SYSTEM', history, new AbortController().signal, runtime);
  const events: string[] = [];
  for await (const event of readSseData(limited.body!)) events.push(event);
  assert.ok(events.some(event => event.includes('"finish_reason":"length"')));
  // Empty faux queue reports an SDK error. The raw diagnostic must not be forwarded.
  const failed = await createCopilotResponse(config, 'TEST_SYSTEM', history, new AbortController().signal, runtime);
  const failure = await failed.text();
  assert.ok(failure.includes('copilot-request-failed'));
  assert.ok(!failure.includes('No more faux responses'));
  assert.ok(!failure.includes('[DONE]'));
  console.log('✓ Copilot 适配：模型/登录检查、无工具多轮上下文、仅正文流、错误隔离及长度上限通过（无网络/凭据访问）');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
