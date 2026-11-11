import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as nodeModule from 'node:module';
import Module from 'node:module';

// Test the real Pi SDK auth storage in an isolated temporary app directory.
// Next normally resolves server-only; preload the test-only CommonJS stub before the SDK modules load.
const require = nodeModule.createRequire(import.meta.url);
const serverOnly = require.resolve('./server-only-stub.cjs');
const mutableModule = Module as unknown as { _resolveFilename: Function };
const originalResolve = mutableModule._resolveFilename;
mutableModule._resolveFilename = function (request: string, ...args: unknown[]) {
  return request === 'server-only' ? serverOnly : originalResolve.call(this, request, ...args);
};
const dir = await mkdtemp(join(tmpdir(), 'ziwei-ai-auth-'));
process.env.DESTINY_THEORY_DATA_DIR = dir;
const secret = 'sk-test-local-only-never-returned-' + 'x'.repeat(24);
try {
  const { PROVIDERS, getProviderDefinition } = require('../../lib/ai/provider-catalog') as typeof import('../../lib/ai/provider-catalog');
  const { startLogin, loginStatus, answerLogin } = require('../../lib/ai/login-sessions');
  const { getAppRuntime, getPiRuntime } = require('../../lib/ai/runtimes');
  const { listProviderModels, resolveProviderModel } = require('../../lib/ai/provider-models');
  const { checkLocalRequest } = require('../../lib/ai/local-request');
  const providers = require('../../app/api/ai/providers/route');
  const login = require('../../app/api/ai/login/route');
  const models = require('../../app/api/ai/models/route');

  assert.equal(getProviderDefinition('kiro'), undefined, 'Kiro must not be selectable without official SDK support');
  assert.ok(PROVIDERS.some(item => item.id === 'kiro' && item.unsupported));
  for (const item of PROVIDERS.filter(item => !item.unsupported)) {
    const runtime = item.sharedPiLogin ? await getPiRuntime() : await getAppRuntime();
    const sdk = runtime.getProvider(item.id);
    assert.ok(sdk, `SDK provider exists: ${item.id}`);
    for (const method of item.auth) assert.ok(method === 'oauth' ? sdk.auth.oauth : sdk.auth.apiKey, `${item.id} supports ${method}`);
  }
  assert.throws(() => startLogin('github-copilot', 'oauth'), /不支持从网页登录/);
  assert.throws(() => startLogin('deepseek', 'oauth'), /登录方式/);
  assert.throws(() => startLogin('../deepseek', 'api_key'), /不支持/);

  const started = startLogin('deepseek', 'api_key');
  assert.throws(() => startLogin('deepseek', 'api_key'), /已有登录流程/);
  let state = loginStatus(started.id);
  for (let i = 0; i < 50 && !state.prompt; i++) { await new Promise(resolve => setTimeout(resolve, 10)); state = loginStatus(started.id); }
  assert.equal(state.prompt?.type, 'secret');
  assert.throws(() => answerLogin(started.id, 'wrong-prompt', secret), /步骤已变化/);
  const answered = answerLogin(started.id, state.prompt!.id, secret);
  assert.ok(!JSON.stringify(answered).includes(secret));
  for (let i = 0; i < 100 && state.state === 'running'; i++) { await new Promise(resolve => setTimeout(resolve, 10)); state = loginStatus(started.id); }
  assert.equal(state.state, 'success');
  assert.ok(!JSON.stringify(state).includes(secret));
  const authFile = join(dir, 'auth.json');
  const authText = await readFile(authFile, 'utf8');
  assert.ok(authText.includes(secret), 'credential is stored only in the isolated app credential store');
  assert.equal((await stat(authFile)).mode & 0o777, 0o600);
  assert.equal((await stat(dir)).mode & 0o777, 0o700);

  const app = await getAppRuntime();
  assert.equal(app.getProviderAuthStatus('deepseek').source, 'stored');
  const catalog = await listProviderModels('deepseek', {}, app);
  assert.ok(catalog.models.length > 0);
  assert.equal(catalog.source, 'sdk-catalog');
  assert.ok(!JSON.stringify(catalog).includes(secret));
  const chosen = await resolveProviderModel('deepseek', catalog.models[0].id);
  assert.equal(chosen.model.provider, 'deepseek');
  await assert.rejects(() => resolveProviderModel('deepseek', 'not-in-catalog'), /不在可用列表/);
  await assert.rejects(() => resolveProviderModel('deepseek', ' bad '), /模型参数/);

  const local = (path: string, init: RequestInit = {}) => new Request('http://127.0.0.1:3000' + path, { ...init, headers: { Origin: 'http://127.0.0.1:3000', ...init.headers } });
  const providerList = await (await providers.GET(local('/api/ai/providers'))).json();
  assert.equal(providerList.providers.find((item: { id: string }) => item.id === 'deepseek').connected, true);
  assert.equal(providerList.providers.find((item: { id: string }) => item.id === 'deepseek').canLogout, true);
  assert.ok(!JSON.stringify(providerList).includes(secret));
  const modelResponse = await (await models.GET(local('/api/ai/models?provider=deepseek'))).json();
  assert.equal(modelResponse.configured, true);
  assert.ok(!JSON.stringify(modelResponse).includes(secret));
  assert.throws(() => checkLocalRequest(new Request('http://public.example/api/ai/providers')), /仅供本机/);
  assert.throws(() => checkLocalRequest(new Request('http://127.0.0.1:3000/api/ai/providers', { headers: { Origin: 'https://attacker.example' } })), /跨站/);
  assert.equal((await login.POST(local('/api/ai/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }))).status, 415);
  const copilotLogout = await providers.DELETE(local('/api/ai/providers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'github-copilot' }) }));
  assert.equal(copilotLogout.status, 400, 'web UI cannot log out the shared Pi Copilot credential');
  const logout = await providers.DELETE(local('/api/ai/providers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'deepseek' }) }));
  assert.equal(logout.status, 200);
  assert.ok(!(await readFile(authFile, 'utf8')).includes(secret));
  console.log('✓ 多服务登录：官方 SDK 白名单、Kiro 不冒充、API Key 交互、隔离凭据存储/权限、不回传密钥、模型列表白名单、仅本机及退出保护通过');
} finally {
  await rm(dir, { recursive: true, force: true });
}
