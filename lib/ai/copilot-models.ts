import { createHash } from 'node:crypto';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { ModelChoice } from './model-types';
import { InterpretError } from './config';

type CatalogRuntime = Pick<ModelRuntime, 'getAuth' | 'getModels'>;
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
export interface CopilotModelCatalog { models: ModelChoice[]; checkedAt: string; unsupportedCount: number }

/** A short-lived per-account cache. Credentials and private endpoint URLs never leave the server. */
export function createCopilotCatalogReader() {
  const cache = new Map<string, { expires: number; catalog: CopilotModelCatalog }>();
  const pending = new Map<string, Promise<CopilotModelCatalog>>();
  return async (runtime: CatalogRuntime, options: { signal?: AbortSignal; refresh?: boolean } = {}, fetcher: typeof fetch = fetch): Promise<CopilotModelCatalog> => {
    const signal = options.signal ?? AbortSignal.timeout(12000);
    const auth = await runtime.getAuth('github-copilot', { signal }); // SDK owns OAuth refresh and locking.
    if (!auth?.auth.apiKey || !auth.auth.baseUrl) throw new InterpretError('找不到 Copilot 登录，请在 Pi 中重新登录。', 503);
    const endpoint = new URL(auth.auth.baseUrl);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      throw new InterpretError('Copilot 模型目录地址无效。', 503);
    }
    const key = createHash('sha256').update(endpoint.toString()).update('\0').update(auth.auth.apiKey).digest('hex');
    const cached = cache.get(key);
    if (!options.refresh && cached && cached.expires > Date.now()) return cached.catalog;
    if (pending.has(key)) return pending.get(key)!;
    const operation = (async () => {
      const response = await fetcher(endpoint.toString().replace(/\/+$/, '') + '/models', {
        method: 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
        // Same catalog protocol headers as pi-ai 1.5.2's Copilot OAuth adapter.
        headers: {
          ...auth.auth.headers, Accept: 'application/json', Authorization: `Bearer ${auth.auth.apiKey}`,
          'User-Agent': 'GitHubCopilotChat/0.35.0', 'Editor-Version': 'vscode/1.107.0',
          'Editor-Plugin-Version': 'copilot-chat/0.35.0', 'Copilot-Integration-Id': 'vscode-chat',
          'X-GitHub-Api-Version': '2026-06-01',
        },
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new InterpretError(response.status === 429 ? 'Copilot 模型列表暂时限流，请稍后刷新。' : '无法获取 Copilot 账号模型列表，请检查登录或稍后刷新。', 503);
      }
      let raw: unknown;
      try { raw = await response.json(); } catch { throw new InterpretError('Copilot 模型列表格式无效。', 502); }
      const data = record(raw)?.data;
      if (!Array.isArray(data) || data.length > 2000) throw new InterpretError('Copilot 模型列表格式无效。', 502);
      const items = data.map(record).filter((item): item is Record<string, unknown> => !!item && typeof item.id === 'string');
      const picker = items.filter(item => item.model_picker_enabled === true);
      // Match the SDK's Individual-account fallback, but never auto-enable unconfigured policies.
      const allowFallback = endpoint.origin === 'https://api.individual.githubcopilot.com' && picker.length === 0;
      const accountAllowed = items.filter(item => {
        const policy = record(item.policy)?.state;
        const capabilities = record(item.capabilities);
        return (allowFallback ? policy === 'enabled' : item.model_picker_enabled === true) &&
          policy !== 'disabled' && policy !== 'unconfigured' && record(capabilities?.supports)?.tool_calls !== false &&
          (capabilities?.type === undefined || capabilities.type === 'chat');
      });
      const supported = new Map(runtime.getModels('github-copilot').map(model => [model.id, model]));
      const choices = new Map<string, ModelChoice>();
      let unsupportedCount = 0;
      for (const item of accountAllowed) {
        const id = item.id as string;
        if (!id || id.length > 200) continue;
        const model = supported.get(id);
        const expected = model && ({ 'openai-responses': '/responses', 'openai-completions': '/chat/completions', 'anthropic-messages': '/v1/messages' } as Record<string, string>)[model.api];
        if (!model || !expected || !model.input.includes('text') ||
            (Array.isArray(item.supported_endpoints) && !item.supported_endpoints.includes(expected))) {
          unsupportedCount++; continue;
        }
        const name = typeof item.name === 'string' && item.name.length <= 160 ? item.name : model.name;
        choices.set(id, { id, name });
      }
      const catalog = { models: [...choices.values()].sort((a, b) => a.name.localeCompare(b.name)), checkedAt: new Date().toISOString(), unsupportedCount };
      if (!catalog.models.length) throw new InterpretError('账号目录中没有当前 SDK 可用的聊天模型，请检查权限或升级 SDK。', 503);
      // Token rotation / changing login naturally changes the key. Bound memory to one active account.
      cache.clear();
      cache.set(key, { catalog, expires: Date.now() + 60000 });
      return catalog;
    })();
    pending.set(key, operation);
    try { return await operation; }
    catch (error) { cache.delete(key); throw error; }
    finally { if (pending.get(key) === operation) pending.delete(key); }
  };
}
