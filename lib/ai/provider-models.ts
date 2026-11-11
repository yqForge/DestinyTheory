import 'server-only';
import type { Api, Model } from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { InterpretError } from './config';
import { getProviderDefinition } from './provider-catalog';
import { getAppRuntime, getPiRuntime } from './runtimes';
import { createCopilotCatalogReader } from './copilot-models';
import type { ModelChoice } from './model-types';

const copilotCatalog = createCopilotCatalogReader();
const textModel = (model: Model<Api>) => model.input.includes('text');

export async function runtimeFor(providerId: string) {
  const provider = getProviderDefinition(providerId);
  if (!provider) throw new InterpretError('不支持此模型服务。');
  return provider.sharedPiLogin ? getPiRuntime() : getAppRuntime();
}

export async function listProviderModels(providerId: string, options: { refresh?: boolean; signal?: AbortSignal } = {}, runtimeOverride?: ModelRuntime) {
  const runtime = runtimeOverride ?? await runtimeFor(providerId);
  if (!await runtime.checkAuth(providerId, { signal: options.signal })) throw new InterpretError('尚未登录或未配置 API Key。', 401);
  if (providerId === 'github-copilot') {
    const catalog = await copilotCatalog(runtime, options);
    return { models: catalog.models, source: 'copilot-live' as const, checkedAt: catalog.checkedAt,
      warning: '账号目录可选不代表逐模型调用测试通过，仍受实时权限及额度限制。' };
  }
  if (options.refresh) {
    const result = await runtime.refresh({ providers: [providerId], allowNetwork: true, signal: options.signal });
    if (result.errors.size) throw new InterpretError('无法刷新该服务的模型目录，请检查登录、密钥或稍后重试。', 503);
  }
  // Pi SDK applies provider/account visibility filters when available (for example login-specific catalogs).
  const models: ModelChoice[] = (await runtime.getAvailable(providerId, { signal: options.signal }))
    .filter(textModel).map(model => ({ id: model.id, name: model.name || model.id }));
  if (!models.length) throw new InterpretError('已连接，但当前 SDK 未提供该账号可用的聊天模型。', 503);
  return { models, source: 'sdk-catalog' as const, checkedAt: new Date().toISOString(),
    warning: '模型来自 Pi SDK 服务商目录与账号可见性规则；不保证每个模型均已开通或有额度。' };
}

export async function resolveProviderModel(providerId: string, modelId: unknown, signal?: AbortSignal) {
  if (typeof modelId !== 'string' || !modelId || modelId.length > 200 || modelId.trim() !== modelId) throw new InterpretError('模型参数无效，请从模型列表选择。');
  const runtime = await runtimeFor(providerId);
  const { models } = await listProviderModels(providerId, { signal }, runtime);
  if (!models.some(model => model.id === modelId)) throw new InterpretError('所选模型当前不在可用列表中，请刷新模型列表后重新选择。');
  const model = runtime.getModel(providerId, modelId);
  if (!model || !textModel(model)) throw new InterpretError('所选模型不支持文本解读。');
  return { runtime, model };
}
