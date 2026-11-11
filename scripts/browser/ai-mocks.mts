import type { Route } from 'playwright-core';

export interface MockModel { id: string; name: string }
export interface MockProvider {
  id: string; label: string; auth: ('oauth' | 'api_key')[]; description: string; connected: boolean;
  canLogout?: boolean; unsupported?: boolean; sharedPiLogin?: boolean;
}
export interface AIMockState {
  providers: MockProvider[];
  models: Record<string, MockModel[]>;
  modelFailure?: boolean;
  providerFailure?: boolean;
  modelGets: string[];
  providerGets: number;
  logins: Record<string, unknown>[];
}
export const defaultProviders = (): MockProvider[] => [
  { id: 'github-copilot', label: 'GitHub Copilot', auth: ['oauth'], description: '复用 Pi 登录', connected: true, sharedPiLogin: true },
  { id: 'openai', label: 'ChatGPT / OpenAI', auth: ['oauth', 'api_key'], description: 'ChatGPT 订阅账号登录，或 OpenAI API Key', connected: false },
  { id: 'deepseek', label: 'DeepSeek', auth: ['api_key'], description: 'DeepSeek API Key', connected: false },
  { id: 'kiro', label: 'Kiro', auth: [], description: '暂不支持', connected: false, unsupported: true },
];
export const createAIMockState = (): AIMockState => ({
  providers: defaultProviders(),
  models: { 'github-copilot': [{ id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol' }], deepseek: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }] },
  modelGets: [], providerGets: 0, logins: [],
});

/** Handles the separated provider/catalog/login API without touching real accounts. */
export async function handleAIMock(route: Route, state: AIMockState): Promise<boolean> {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === '/api/ai/providers' && request.method() === 'GET') {
    state.providerGets++;
    await route.fulfill(state.providerFailure ? { status: 503, json: { error: 'mock provider failure' } } : { json: { providers: state.providers } });
    return true;
  }
  if (url.pathname === '/api/ai/providers' && request.method() === 'DELETE') {
    const body = request.postDataJSON() as { provider: string };
    state.providers = state.providers.map(provider => provider.id === body.provider ? { ...provider, connected: false, canLogout: false } : provider);
    await route.fulfill({ json: { ok: true } });
    return true;
  }
  if (url.pathname === '/api/ai/models') {
    state.modelGets.push(url.toString());
    const provider = url.searchParams.get('provider') ?? '';
    await route.fulfill(state.modelFailure ? { status: 503, json: { error: 'model list failed' } } : { json: {
      configured: true, provider, providerLabel: state.providers.find(item => item.id === provider)?.label,
      models: state.models[provider] ?? [], source: provider === 'github-copilot' ? 'copilot-live' : 'sdk-catalog',
      checkedAt: '2026-01-01T00:00:00Z', warning: '模拟目录：可选仍受实时权限与额度限制。',
    } });
    return true;
  }
  if (url.pathname === '/api/ai/login') {
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.logins.push(body);
      if (body.action === 'answer') {
        state.providers = state.providers.map(provider => provider.id === 'deepseek' ? { ...provider, connected: true, canLogout: true } : provider);
        await route.fulfill({ json: { id: 'mock-login', provider: 'deepseek', method: 'api_key', state: 'success', events: [] } });
      } else if (body.method === 'oauth') {
        await route.fulfill({ json: { id: 'mock-oauth', provider: body.provider, method: 'oauth', state: 'running',
          events: [{ type: 'auth_url', url: 'https://example.com/official-login', instructions: '模拟官方登录' }] } });
      } else {
        await route.fulfill({ json: { id: 'mock-login', provider: body.provider, method: 'api_key', state: 'running', events: [],
          prompt: { id: 'prompt-1', type: 'secret', message: 'Enter DeepSeek API key' } } });
      }
    } else if (request.method() === 'GET') {
      await route.fulfill({ json: { id: url.searchParams.get('id'), provider: 'deepseek', method: 'api_key', state: 'success', events: [] } });
    } else await route.fulfill({ json: { ok: true } });
    return true;
  }
  return false;
}
