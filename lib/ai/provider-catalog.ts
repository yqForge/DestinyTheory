export type ProviderAuthKind = 'oauth' | 'api_key';
export interface ProviderDefinition {
  id: string;
  label: string;
  auth: readonly ProviderAuthKind[];
  description: string;
  sharedPiLogin?: boolean;
  unsupported?: boolean;
}

/**
 * Explicit whitelist exposed by the local web UI. Every supported entry maps to an
 * official provider implementation in the pinned Pi SDK. Unsupported items are
 * shown only as unavailable choices; no unofficial login or token impersonation.
 */
export const PROVIDERS: readonly ProviderDefinition[] = [
  { id: 'github-copilot', label: 'GitHub Copilot', auth: ['oauth'], sharedPiLogin: true,
    description: '复用本机 Pi 已登录的 Copilot 账号，网页不修改或退出 Pi 登录' },
  { id: 'openai', label: 'ChatGPT / OpenAI', auth: ['oauth', 'api_key'], description: 'ChatGPT 订阅账号登录，或 OpenAI API Key' },
  { id: 'anthropic', label: 'Claude', auth: ['oauth', 'api_key'], description: 'Claude Pro/Max 账号登录，或 Anthropic API Key' },
  { id: 'xai', label: 'xAI / Grok', auth: ['oauth', 'api_key'], description: 'SuperGrok / X Premium 登录，或 xAI API Key' },
  { id: 'kimi-coding', label: 'Kimi Code', auth: ['oauth', 'api_key'], description: 'Kimi Code 订阅登录，或 Kimi API Key' },
  { id: 'deepseek', label: 'DeepSeek', auth: ['api_key'], description: 'DeepSeek API Key' },
  { id: 'google', label: 'Google Gemini', auth: ['api_key'], description: 'Gemini API Key' },
  { id: 'openrouter', label: 'OpenRouter', auth: ['oauth', 'api_key'], description: 'OpenRouter 登录，或 OpenRouter API Key' },
  { id: 'moonshotai-cn', label: 'Moonshot / Kimi 开放平台（中国）', auth: ['api_key'], description: 'Moonshot AI 中国区 API Key' },
  { id: 'zai-coding-cn', label: '智谱 Z.AI Coding（中国）', auth: ['api_key'], description: 'Z.AI Coding CN API Key' },
  { id: 'qwen-token-plan-cn', label: '通义千问 Token Plan（中国）', auth: ['api_key'], description: 'Qwen Token Plan CN API Key' },
  { id: 'xiaomi', label: '小米 MiMo', auth: ['api_key'], description: 'Xiaomi MiMo API Key' },
  { id: 'kiro', label: 'Kiro', auth: [], unsupported: true,
    description: '当前固定版本 Pi SDK 未提供 Kiro 官方登录或模型接口，暂不接入' },
];

export const getProviderDefinition = (id: unknown) => typeof id === 'string'
  ? PROVIDERS.find(provider => provider.id === id && !provider.unsupported)
  : undefined;
