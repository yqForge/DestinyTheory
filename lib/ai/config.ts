export class InterpretError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
export const isLoopbackHost = (hostname: string) => loopbackHosts.has(hostname);

type Env = Record<string, string | undefined>;

/** Server-side only. Never return apiKey, URL or the raw environment to the browser. */
export function getAIConfig(env: Env = process.env) {
  const provider = env.AI_PROVIDER?.trim() || 'deepseek';
  const integer = (name: string, fallback: number, min: number, max: number) => {
    const value = env[name] === undefined || env[name] === '' ? fallback : Number(env[name]);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new InterpretError(`${name} 必须是 ${min}–${max} 之间的整数。`, 503);
    }
    return value;
  };
  const limits = {
    maxTokens: integer('AI_MAX_TOKENS', 4096, 256, 16384),
    timeoutMs: integer('AI_TIMEOUT_MS', 120000, 1000, 300000),
  };
  if (provider === 'github-copilot') {
    const model = env.AI_MODEL?.trim() || env.COPILOT_MODEL?.trim();
    if (!model) throw new InterpretError('请在 .env.local 中用 AI_MODEL 指定 Pi 中可用的 Copilot 模型 ID。', 503);
    const reasoning = env.AI_REASONING?.trim() || 'medium';
    if (!['off', 'minimal', 'low', 'medium', 'high'].includes(reasoning)) {
      throw new InterpretError('AI_REASONING 应为 off、minimal、low、medium 或 high。', 503);
    }
    return { kind: 'copilot' as const, provider, model, remote: true,
      reasoning: reasoning as 'off' | 'minimal' | 'low' | 'medium' | 'high', ...limits };
  }
  const presets: Record<string, { base?: string; model?: string; prefix: string }> = {
    deepseek: { base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', prefix: 'DEEPSEEK' },
    mimo: { prefix: 'MIMO' },
    openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', prefix: 'OPENAI' },
    ollama: { base: 'http://127.0.0.1:11434/v1', prefix: 'OLLAMA' },
    custom: { prefix: 'AI' },
  };
  const preset = presets[provider];
  if (!preset) throw new InterpretError('AI_PROVIDER 应为 github-copilot、deepseek、mimo、openai、ollama 或 custom。', 503);
  const base = env.AI_BASE_URL?.trim() || env[`${preset.prefix}_BASE_URL`]?.trim() || preset.base;
  const model = env.AI_MODEL?.trim() || env[`${preset.prefix}_MODEL`]?.trim() || preset.model;
  const apiKey = env.AI_API_KEY?.trim() || env[`${preset.prefix}_API_KEY`]?.trim();
  if (!base || !model) throw new InterpretError('请在 .env.local 中配置 AI_BASE_URL 和 AI_MODEL（MiMo 也支持 MIMO_BASE_URL / MIMO_MODEL）。', 503);
  let url: URL;
  try { url = new URL(base); } catch { throw new InterpretError('AI_BASE_URL 不是有效的 URL。', 503); }
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname)))) {
    throw new InterpretError('AI_BASE_URL 必须使用 HTTPS；只有本机地址允许 HTTP，且不能包含凭据、查询参数或片段。', 503);
  }
  const remote = !isLoopbackHost(url.hostname);
  if ((!apiKey || /^(your-|replace-|sk-xxx)/i.test(apiKey)) && remote) {
    throw new InterpretError('尚未配置 AI 密钥，请在项目根目录的 .env.local 中填写 AI_API_KEY 或对应服务商的 API_KEY，然后重启服务。', 503);
  }
  return {
    kind: 'openai' as const, provider, model, apiKey, remote,
    endpoint: `${url.toString().replace(/\/+$/, '')}/chat/completions`, ...limits,
  };
}
