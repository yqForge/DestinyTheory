import { InterpretError, isLoopbackHost } from './config';

/** Local-only API guard. Uses the actual Host and Origin, never forwarded-host headers. */
export function checkLocalRequest(request: Request) {
  const url = new URL(request.url);
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

export async function readJson(request: Request, maxBytes = 16384): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new InterpretError('请求必须使用 application/json。', 415);
  if (Number(request.headers.get('content-length')) > maxBytes) throw new InterpretError('请求过大。', 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new InterpretError('请求过大。', 413);
  try { return JSON.parse(text); } catch { throw new InterpretError('请求不是有效的 JSON。'); }
}
