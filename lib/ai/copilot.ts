import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { Context, Message, Models } from '@earendil-works/pi-ai';
import type { ChatMessage } from './interpret-context';
import { InterpretError, type getAIConfig } from './config';
import { createCopilotCatalogReader } from './copilot-models';

type CopilotConfig = Extract<ReturnType<typeof getAIConfig>, { kind: 'copilot' }>;
export type CopilotRuntime = Pick<Models, 'getModel' | 'checkAuth' | 'streamSimple'>;
let runtimePromise: Promise<ModelRuntime> | undefined;

function getRuntime() {
  // Model access only: no AgentSession, tools, extensions, project prompts or personal context files.
  // The SDK uses Pi's normal locked auth store and refreshes OAuth without copying credentials.
  runtimePromise ??= import('@earendil-works/pi-coding-agent')
    .then(({ ModelRuntime }) => ModelRuntime.create({ modelsPath: null, refreshOnCreate: false, allowModelNetwork: false }))
    .catch(error => { runtimePromise = undefined; throw error; });
  return runtimePromise;
}

const readCatalog = createCopilotCatalogReader();
export async function getCopilotModels(options: { refresh?: boolean; signal?: AbortSignal } = {}) {
  return readCatalog(await getRuntime(), options);
}

export async function checkCopilot(modelId: string, signal?: AbortSignal, providedRuntime?: CopilotRuntime) {
  const runtime = providedRuntime ?? await getRuntime();
  const model = runtime.getModel('github-copilot', modelId);
  if (!model) throw new InterpretError('Pi SDK 未列出此 Copilot 模型，请核对 AI_MODEL 或更新与 Pi 匹配的 SDK。', 503);
  if (!await runtime.checkAuth('github-copilot', { signal })) {
    throw new InterpretError('尚未找到 Pi 的 Copilot 登录，请在 Pi 中执行 /login github-copilot 后重试。', 503);
  }
  return { runtime, model };
}

/** Adapt Pi's provider-native stream to the same OpenAI SSE framing as the other backends. */
export async function createCopilotResponse(
  config: CopilotConfig, systemPrompt: string, messages: ChatMessage[], signal: AbortSignal,
  providedRuntime?: CopilotRuntime,
): Promise<Response> {
  const { runtime, model } = await checkCopilot(config.model, signal, providedRuntime);
  const transcript: Message[] = messages.map((message, index) => message.role === 'user'
    ? { role: 'user', content: message.content, timestamp: Date.now() + index }
    : {
      role: 'assistant', content: [{ type: 'text', text: message.content }],
      api: model.api, provider: model.provider, model: model.id, stopReason: 'stop', timestamp: Date.now() + index,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    });
  const context: Context = { systemPrompt, messages: transcript, tools: [] };
  const abort = new AbortController();
  const combined = AbortSignal.any([signal, abort.signal]);
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        if (!cancelled) controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        const events = runtime.streamSimple(model, context, {
          signal: combined, maxTokens: model.maxTokens > 0 ? Math.min(config.maxTokens, model.maxTokens) : config.maxTokens,
          reasoning: config.reasoning === 'off' ? undefined : config.reasoning,
          cacheRetention: 'none',
        });
        let complete = false;
        for await (const event of events) {
          if (cancelled) break;
          if (event.type === 'text_delta') send({ choices: [{ delta: { content: event.delta } }] });
          // No thinking, auth, usage diagnostics, raw provider errors or tool calls reach the browser.
          if (event.type === 'error') throw new Error('copilot-stream-error');
          if (event.type === 'done') {
            if (event.reason !== 'stop' && event.reason !== 'length') throw new Error('unexpected-model-stop');
            send({ choices: [{ delta: {}, finish_reason: event.reason }] });
            complete = true;
            break;
          }
        }
        if (!complete) throw new Error('copilot-stream-incomplete');
        if (!cancelled) controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch {
        send({ error: 'copilot-request-failed' });
      } finally {
        abort.abort();
        if (!cancelled) controller.close();
      }
    },
    cancel() { cancelled = true; abort.abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
}
