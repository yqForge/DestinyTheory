import { type getAIConfig, InterpretError } from './config';
import type { AIModelStatus } from './model-types';
import type { CopilotModelCatalog } from './copilot-models';

type Config = ReturnType<typeof getAIConfig>;
interface Discovery {
  getCopilotModels(options?: { refresh?: boolean; signal?: AbortSignal }): Promise<CopilotModelCatalog>;
  checkCopilot(model: string, signal?: AbortSignal): Promise<unknown>;
}

/** No inference, policy activation, credential serialization or persistent model-setting changes. */
export async function listAIModels(config: Config, options: { refresh?: boolean; signal?: AbortSignal } = {}, injected?: Discovery): Promise<AIModelStatus> {
  const base = { configured: true, provider: config.provider, model: config.model, remote: config.remote };
  if (config.kind !== 'copilot') return { ...base, models: [{ id: config.model, name: config.model }], modelSource: 'configured',
    warning: '当前服务商暂只提供已配置的默认模型；动态账号模型选择目前支持 GitHub Copilot。' };
  const discovery = injected ?? await import('./copilot');
  try {
    const catalog = await discovery.getCopilotModels(options);
    const warnings = ['账号目录可选不代表逐模型调用测试通过，仍受实时权限及额度限制。'];
    if (!catalog.models.some(model => model.id === config.model)) warnings.push('默认模型不在可选目录中，请另选一个模型。');
    if (catalog.unsupportedCount) warnings.push(`另有 ${catalog.unsupportedCount} 项目录模型因当前 SDK 或接口不兼容未列出。`);
    return { ...base, models: catalog.models, modelSource: 'copilot-live', checkedAt: catalog.checkedAt, warning: warnings.join(' ') };
  } catch {
    await discovery.checkCopilot(config.model, options.signal);
    return { ...base, models: [{ id: config.model, name: config.model }], modelSource: 'configured',
      warning: '暂时无法刷新账号模型目录，当前仅保留已配置的默认模型；可稍后重试，默认模型也可能受权限或额度限制。' };
  }
}

export async function resolveRequestModel(config: Config, selected: unknown, signal?: AbortSignal, injected?: Discovery): Promise<Config> {
  if (selected === undefined) return config; // Backward compatible with existing single-model clients.
  if (typeof selected !== 'string' || !selected || selected.length > 200 || selected.trim() !== selected) {
    throw new InterpretError('模型参数无效，请从模型列表选择。');
  }
  const status = await listAIModels(config, { signal }, injected);
  if (!status.models?.some(model => model.id === selected)) throw new InterpretError('所选模型当前不在可用列表中，请刷新模型列表后重新选择。');
  return { ...config, model: selected };
}
