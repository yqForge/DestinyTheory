import { readSseData } from './sse';

/** Consume the local normalized SSE protocol, retaining partial text if an error follows. */
export async function consumeInterpretation(response: Response, onText: (text: string) => void): Promise<void> {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(typeof data?.error === 'string' ? data.error : 'AI 请求失败，请检查本地配置。');
  }
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw new Error('AI 接口未返回流式响应。');
  }
  let text = '';
  for await (const data of readSseData(response.body)) {
    if (data === '[DONE]') {
      if (!text) throw new Error('模型未返回解读正文。');
      return;
    }
    let event;
    try { event = JSON.parse(data); } catch { throw new Error('AI 响应格式错误，请重试。'); }
    if (typeof event?.error === 'string') throw new Error(event.error);
    if (typeof event?.delta?.text === 'string') {
      text += event.delta.text;
      onText(text);
    }
  }
  throw new Error('AI 连接提前结束，已显示的内容可能不完整，请重试。');
}
