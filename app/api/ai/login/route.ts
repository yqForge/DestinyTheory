import { InterpretError } from '@/lib/ai/config';
import { checkLocalRequest, readJson } from '@/lib/ai/local-request';
import { answerLogin, cancelLogin, loginStatus, startLogin } from '@/lib/ai/login-sessions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const failure = (value: unknown) => Response.json({ error: value instanceof InterpretError ? value.message : '登录处理失败。' },
  { status: value instanceof InterpretError ? value.status : 500, headers: noStore });

export async function GET(request: Request) {
  try { checkLocalRequest(request); return Response.json(loginStatus(new URL(request.url).searchParams.get('id')), { headers: noStore }); }
  catch (value) { return failure(value); }
}

export async function POST(request: Request) {
  try {
    checkLocalRequest(request);
    const body = await readJson(request, 12000) as Record<string, unknown>;
    return Response.json(body.action === 'answer' ? answerLogin(body.id, body.promptId, body.value) : startLogin(body.provider, body.method), { headers: noStore });
  } catch (value) { return failure(value); }
}

export async function DELETE(request: Request) {
  try {
    checkLocalRequest(request);
    const body = await readJson(request, 2048) as { id?: unknown };
    cancelLogin(body.id);
    return Response.json({ ok: true }, { headers: noStore });
  } catch (value) { return failure(value); }
}
