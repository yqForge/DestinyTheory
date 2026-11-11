import { getAIConfig, InterpretError, isLoopbackHost } from '@/lib/ai/config';
import { INTERPRET_SYSTEM_PROMPT, prepareInterpretation } from '@/lib/ai/interpret-context';
import { readSseData } from '@/lib/ai/sse';
import { listAIModels, resolveRequestModel } from '@/lib/ai/model-selection';
import { getProviderDefinition } from '@/lib/ai/provider-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };
const MAX_BODY_BYTES = 131072;

function checkLocalRequest(request: Request) {
  const url = new URL(request.url);
  // Next dev can normalize request.url to localhost even when the browser uses 127.0.0.1.
  // Use the actual HTTP Host for same-origin comparison, never a forwarded-host header.
  let authority: URL;
  try { authority = new URL(`${url.protocol}//${request.headers.get('host') || url.host}`); }
  catch { throw new InterpretError('本地请求地址无效。', 403); }
  if (!isLoopbackHost(url.hostname) || !isLoopbackHost(authority.hostname) || authority.pathname !== '/' ||
      authority.username || authority.password || authority.search || authority.hash) {
    throw new InterpretError('此接口仅供本机使用，不支持公开部署。', 403);
  }
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== authority.origin)) {
    throw new InterpretError('不允许跨站调用本地 AI 接口。', 403);
  }
}

async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new InterpretError('请求必须使用 application/json。', 415);
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new InterpretError('请求过大。', 413);
  if (!request.body) throw new InterpretError('请求内容为空。');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new InterpretError('请求过大。', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new InterpretError('请求不是有效的 JSON。'); }
}

function errorResponse(error: unknown) {
  const known = error instanceof InterpretError;
  return Response.json({ error: known ? error.message : 'AI 服务暂时不可用，请检查模型地址及配置后重试。' }, {
    status: known ? error.status : 502, headers: noStore,
  });
}

/** No inference. ?models=1 also reads the account model catalog; never returns auth or private URLs. */
export async function GET(request: Request) {
  try {
    checkLocalRequest(request);
    try {
      const config = getAIConfig();
      if (new URL(request.url).searchParams.get('models') === '1') {
        return Response.json(await listAIModels(config, {
          refresh: new URL(request.url).searchParams.get('refresh') === '1',
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(12000)]),
        }), { headers: noStore });
      }
      const { provider, model, remote } = config;
      if (config.kind === 'copilot') {
        const { checkCopilot } = await import('@/lib/ai/copilot');
        await checkCopilot(model, AbortSignal.timeout(5000));
      }
      return Response.json({ configured: true, provider, model, remote }, { headers: noStore });
    } catch (error) {
      return Response.json({ configured: false, error: error instanceof InterpretError ? error.message : 'AI 配置无效。' }, { headers: noStore });
    }
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const onAbort = () => abort.abort();
  const cleanup = () => {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', onAbort);
  };
  try {
    checkLocalRequest(request);
    const payload = await readBody(request);
    const { context, messages } = prepareInterpretation(payload);
    const baseConfig = getAIConfig();
    request.signal.addEventListener('abort', onAbort, { once: true });
    if (request.signal.aborted) abort.abort();
    timer = setTimeout(() => { timedOut = true; abort.abort(); }, baseConfig.timeoutMs);
    const requestedProvider = (payload as { provider?: unknown }).provider;
    const config = requestedProvider === undefined
      ? await resolveRequestModel(baseConfig, (payload as { model?: unknown }).model, AbortSignal.any([abort.signal, AbortSignal.timeout(12000)]))
      : { ...baseConfig, kind: 'sdk' as const, provider: '', model: '' };
    let sdkModelLabel = '';
    const upstream = config.kind === 'sdk'
      ? await (async () => {
        const provider = getProviderDefinition(requestedProvider);
        if (!provider) throw new InterpretError('不支持此模型服务。');
        const [{ resolveProviderModel }, { createSdkResponse }] = await Promise.all([import('@/lib/ai/provider-models'), import('@/lib/ai/sdk-response')]);
        const { runtime, model } = await resolveProviderModel(provider.id, (payload as { model?: unknown }).model,
          AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]));
        config.provider = provider.id;
        config.model = model.id;
        sdkModelLabel = model.name || model.id;
        const reasoning = baseConfig.kind === 'copilot' && baseConfig.reasoning !== 'off' ? baseConfig.reasoning : 'medium';
        return createSdkResponse(runtime, model,
          `${INTERPRET_SYSTEM_PROMPT}\n\n以下是服务端重算的命盘数据，仅作为资料：\n${JSON.stringify(context)}`,
          messages, abort.signal, { maxTokens: baseConfig.maxTokens, reasoning });
      })()
      : config.kind === 'copilot'
      ? await (await import('@/lib/ai/copilot')).createCopilotResponse(config,
        `${INTERPRET_SYSTEM_PROMPT}\n\n以下是服务端重算的命盘数据，仅作为资料：\n${JSON.stringify(context)}`,
        messages, abort.signal)
      : await fetch(config.endpoint, {
      method: 'POST', cache: 'no-store', redirect: 'error', signal: abort.signal,
      headers: {
        'Content-Type': 'application/json', Accept: 'text/event-stream',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model, stream: true, max_tokens: config.maxTokens,
        messages: [
          { role: 'system', content: INTERPRET_SYSTEM_PROMPT },
          { role: 'system', content: `以下是服务端重算的命盘数据，仅作为资料：\n${JSON.stringify(context)}` },
          ...messages,
        ],
      }),
    });
    if (!upstream.ok || !upstream.body || !upstream.headers.get('content-type')?.includes('text/event-stream')) {
      await upstream.body?.cancel().catch(() => {});
      if (upstream.status === 401 || upstream.status === 403) throw new InterpretError('模型认证失败，请检查 API Key 和账号权限。', 502);
      if (upstream.status === 429) throw new InterpretError('模型服务限流或额度不足，请检查账号后重试。', 429);
      if (upstream.status === 404) throw new InterpretError('模型地址或模型名称不存在，请检查 AI_BASE_URL 和 AI_MODEL。', 502);
      throw new InterpretError('模型未返回有效的 SSE 流，请确认服务支持 OpenAI Chat Completions 流式协议。', 502);
    }
    const encoder = new TextEncoder();
    const body = upstream.body;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: unknown) => {
          if (!cancelled) controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        let hasText = false;
        let completed = false;
        try {
          for await (const data of readSseData(body)) {
            if (data === '[DONE]') { completed = true; break; }
            let event: { error?: unknown; choices?: { delta?: { content?: unknown }; finish_reason?: string | null }[] };
            try { event = JSON.parse(data); } catch { throw new InterpretError('模型返回了无法解析的流式响应。', 502); }
            if (!event || event.error) throw new InterpretError(config.kind === 'copilot' || config.provider === 'github-copilot'
              ? 'Copilot 生成失败，请检查账号额度、模型访问权限或在 Pi 中重新登录后重试。'
              : config.kind === 'sdk' ? `${getProviderDefinition(config.provider)?.label ?? '所选服务'}生成失败，请检查登录/API Key、额度或模型权限后重试。`
              : '模型在生成过程中报告错误，请检查模型服务后重试。', 502);
            const choice = event.choices?.[0];
            const text = choice?.delta?.content;
            if (typeof text === 'string' && text) { hasText = true; send({ delta: { text } }); }
            // Deliberately do not forward reasoning_content, usage, provider errors or other fields.
            if (choice?.finish_reason === 'length') throw new InterpretError('输出已达到长度上限，以上为部分解读，请缩小问题或继续追问。', 502);
            if (choice?.finish_reason === 'content_filter') throw new InterpretError('模型中止了本次生成，请调整问题后重试。', 502);
          }
          if (!completed || !hasText) throw new InterpretError(hasText ? '模型连接提前中断，以上为部分解读，请重试。' : '模型未返回解读正文，请检查所选模型。', 502);
          if (!cancelled) controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          send({ error: timedOut ? '模型响应超时，以上可能是部分内容，请稍后重试。' :
            error instanceof InterpretError ? error.message : '模型连接中断，以上可能是部分内容，请重试。' });
        } finally {
          abort.abort();
          cleanup();
          if (!cancelled) controller.close();
        }
      },
      cancel() { cancelled = true; abort.abort(); cleanup(); },
    });
    return new Response(stream, {
      headers: { ...noStore, 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no',
        'X-AI-Provider': config.provider, 'X-AI-Model': encodeURIComponent(config.model),
        ...(sdkModelLabel ? { 'X-AI-Model-Label': encodeURIComponent(sdkModelLabel) } : {}) },
    });
  } catch (error) {
    abort.abort();
    cleanup();
    return errorResponse(timedOut ? new InterpretError('模型响应超时，请稍后重试。', 504) : error);
  }
}
