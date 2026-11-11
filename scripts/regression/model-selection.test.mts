import assert from 'node:assert/strict';
import { fauxProvider, type Model, type Api } from '@earendil-works/pi-ai';
import { createCopilotCatalogReader } from '../../lib/ai/copilot-models';
import { listAIModels, resolveRequestModel } from '../../lib/ai/model-selection';
import { getAIConfig } from '../../lib/ai/config';

const seed = fauxProvider().getModel();
const model = (id: string): Model<Api> => ({ ...seed, id, name: id, api: 'openai-responses', provider: 'github-copilot', input: ['text'], maxTokens: 4096 });
let token = 'test-private-token-not-real';
const runtime = {
  async getAuth() { return { auth: { apiKey: token, baseUrl: 'https://api.individual.githubcopilot.com', headers: { 'X-Private': 'test-private-header' } } }; },
  getModels() { return ['model-a', 'model-b', 'disabled', 'unconfigured', 'not-picker', 'wrong-endpoint'].map(model); },
};
const row = (id: string, extra: object = {}) => ({ id, name: id.toUpperCase(), model_picker_enabled: true, policy: { state: 'enabled' },
  capabilities: { type: 'chat', supports: { tool_calls: true } }, supported_endpoints: ['/responses'], ...extra });
const data = [row('model-a'), row('model-b', { policy: undefined }), row('disabled', { policy: { state: 'disabled' } }),
  row('unconfigured', { policy: { state: 'unconfigured' } }), row('not-picker', { model_picker_enabled: false }),
  row('unknown-sdk-model'), row('wrong-endpoint', { supported_endpoints: ['/chat/completions'] }),
  row('classifier', { capabilities: { type: 'classifier' } }), row('no-tools', { capabilities: { type: 'chat', supports: { tool_calls: false } } })];
let calls = 0;
const fetcher: typeof fetch = async (url, init) => {
  calls++;
  assert.equal(String(url), 'https://api.individual.githubcopilot.com/models');
  assert.equal(init?.method, 'GET', 'never activate policies or send inference requests');
  assert.equal(init?.redirect, 'error');
  assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${token}`);
  assert.ok(init?.signal);
  return Response.json({ data });
};

async function main() {
  const read = createCopilotCatalogReader();
  const catalog = await read(runtime, {}, fetcher);
  assert.deepEqual(catalog.models.map(item => item.id), ['model-a', 'model-b']);
  assert.equal(catalog.unsupportedCount, 2);
  assert.ok(!JSON.stringify(catalog).includes('test-private'));
  assert.ok(!JSON.stringify(catalog).includes('githubcopilot.com'));
  await read(runtime, {}, fetcher);
  assert.equal(calls, 1, 'cached catalog');
  await read(runtime, { refresh: true }, fetcher);
  assert.equal(calls, 2, 'explicit refresh');
  const now = Date.now;
  try { Date.now = () => now() + 61000; await read(runtime, {}, fetcher); assert.equal(calls, 3, 'TTL expiration'); }
  finally { Date.now = now; }
  token = 'another-test-login';
  await read(runtime, {}, fetcher);
  assert.equal(calls, 4, 'different account/token must not reuse the previous catalog');
  const concurrent = createCopilotCatalogReader();
  let concurrentCalls = 0;
  const concurrentFetch: typeof fetch = async () => { concurrentCalls++; await new Promise(resolve => setTimeout(resolve, 10)); return Response.json({ data: [row('model-a')] }); };
  await Promise.all([concurrent(runtime, {}, concurrentFetch), concurrent(runtime, {}, concurrentFetch)]);
  assert.equal(concurrentCalls, 1, 'deduplicate concurrent initial catalog requests');
  const refreshFailure = createCopilotCatalogReader();
  let afterFailureFetches = 0;
  const recoveringFetch: typeof fetch = async () => { afterFailureFetches++; return Response.json({ data: [row('model-a')] }); };
  await refreshFailure(runtime, {}, recoveringFetch);
  await assert.rejects(() => refreshFailure(runtime, { refresh: true }, async () => new Response('private failure', { status: 500 })));
  await refreshFailure(runtime, {}, recoveringFetch);
  assert.equal(afterFailureFetches, 2, 'a failed refresh must invalidate the old account catalog');
  const individual = await createCopilotCatalogReader()(runtime, {}, async () => Response.json({ data: [row('model-a', { model_picker_enabled: false })] }));
  assert.equal(individual.models[0].id, 'model-a');
  await assert.rejects(() => createCopilotCatalogReader()({ ...runtime, getAuth: async () => ({ auth: { apiKey: token, baseUrl: 'https://copilot-api.example.test' } }) }, {},
    async () => Response.json({ data: [row('model-a', { model_picker_enabled: false })] })), /没有当前 SDK/);
  for (const response of [new Response('test-private-token-not-real RAW_PROVIDER_ERROR', { status: 401 }), Response.json({ broken: [] }), new Response('invalid json')]) {
    await assert.rejects(() => createCopilotCatalogReader()(runtime, {}, async () => response), error => {
      assert.ok(error instanceof Error && !error.message.includes('test-private') && !error.message.includes('RAW_PROVIDER_ERROR'));
      return true;
    });
  }
  await assert.rejects(() => createCopilotCatalogReader()({ ...runtime, getAuth: async () => undefined }, {}, fetcher), /登录/);
  await assert.rejects(() => createCopilotCatalogReader()({ ...runtime, getAuth: async () => ({ auth: { apiKey: token, baseUrl: 'http://example.test' } }) }, {}, fetcher), /地址无效/);

  const config = getAIConfig({ AI_PROVIDER: 'github-copilot', AI_MODEL: 'model-a' });
  const discovery = { getCopilotModels: async () => catalog, checkCopilot: async () => ({}) };
  const status = await listAIModels(config, {}, discovery);
  assert.equal(status.modelSource, 'copilot-live');
  assert.equal(status.models?.length, 2);
  assert.ok(status.warning?.includes('不代表逐模型'));
  const switched = await resolveRequestModel(config, 'model-b', undefined, discovery);
  assert.equal(switched.model, 'model-b');
  assert.equal(config.model, 'model-a', 'request selection never mutates the default config');
  assert.equal((await resolveRequestModel(config, undefined, undefined, discovery)).model, 'model-a');
  for (const invalid of ['', ' model-b', 17, {}, 'x'.repeat(201), 'disabled', 'unknown-sdk-model']) {
    await assert.rejects(() => resolveRequestModel(config, invalid, undefined, discovery), /模型/);
  }
  const failed = { getCopilotModels: async (): Promise<never> => { throw Error('RAW_SECRET'); }, checkCopilot: async () => ({}) };
  const fallback = await listAIModels(config, {}, failed);
  assert.equal(fallback.modelSource, 'configured');
  assert.deepEqual(fallback.models, [{ id: 'model-a', name: 'model-a' }]);
  assert.ok(!JSON.stringify(fallback).includes('RAW_SECRET'));
  await assert.rejects(() => resolveRequestModel(config, 'model-b', undefined, failed), /不在可用列表/);
  const basic = getAIConfig({ AI_PROVIDER: 'ollama', AI_MODEL: 'local-model' });
  assert.equal((await listAIModels(basic)).models?.[0].id, 'local-model');
  await assert.rejects(() => resolveRequestModel(basic, 'not-configured'), /不在可用列表/);
  console.log('✓ 模型目录：账号权限/SDK/协议筛选、只读查询、凭据隔离、刷新/缓存/切换登录、请求白名单与降级通过（无网络/凭据访问）');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
