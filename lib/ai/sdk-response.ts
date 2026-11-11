import 'server-only';
import type { Api, Context, Message, Model, Models } from '@earendil-works/pi-ai';
import type { ChatMessage } from './interpret-context';

/** Pi SDK stream → the normalized OpenAI-style SSE consumed by app/api/interpret. */
export function createSdkResponse(
  runtime: Pick<Models, 'streamSimple'>, model: Model<Api>, systemPrompt: string,
  messages: ChatMessage[], signal: AbortSignal, options: { maxTokens: number; reasoning?: 'minimal' | 'low' | 'medium' | 'high' },
): Response {
  const transcript: Message[] = messages.map((message, index) => message.role === 'user'
    ? { role: 'user', content: message.content, timestamp: Date.now() + index }
    : {
      role: 'assistant', content: [{ type: 'text', text: message.content }], api: model.api,
      provider: model.provider, model: model.id, stopReason: 'stop', timestamp: Date.now() + index,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    });
  const context: Context = { systemPrompt, messages: transcript, tools: [] };
  const abort = new AbortController();
  const combined = AbortSignal.any([signal, abort.signal]);
  const encoder = new TextEncoder();
  let cancelled = false;
  return new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => { if (!cancelled) controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)); };
      try {
        let complete = false;
        const events = runtime.streamSimple(model, context, {
          signal: combined, cacheRetention: 'none',
          maxTokens: model.maxTokens > 0 ? Math.min(options.maxTokens, model.maxTokens) : options.maxTokens,
          reasoning: model.reasoning ? options.reasoning : undefined,
        });
        for await (const event of events) {
          if (cancelled) break;
          if (event.type === 'text_delta') send({ choices: [{ delta: { content: event.delta } }] });
          // Never forward thinking blocks, tool calls, usage, auth diagnostics or raw provider errors.
          if (event.type === 'error') throw new Error('sdk-stream-error');
          if (event.type === 'done') {
            if (event.reason !== 'stop' && event.reason !== 'length') throw new Error('unexpected-model-stop');
            send({ choices: [{ delta: {}, finish_reason: event.reason }] });
            complete = true; break;
          }
        }
        if (!complete) throw new Error('sdk-stream-incomplete');
        if (!cancelled) controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch {
        send({ error: 'provider-request-failed' });
      } finally {
        abort.abort();
        if (!cancelled) controller.close();
      }
    },
    cancel() { cancelled = true; abort.abort(); },
  }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
}
