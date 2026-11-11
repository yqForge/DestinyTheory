import { InterpretError } from '@/lib/ai/config';
import { checkLocalRequest, readJson } from '@/lib/ai/local-request';
import { PROVIDERS, getProviderDefinition } from '@/lib/ai/provider-catalog';
import { getAppRuntime, getPiRuntime } from '@/lib/ai/runtimes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const error = (value: unknown) => Response.json({ error: value instanceof InterpretError ? value.message : '服务状态读取失败。' },
  { status: value instanceof InterpretError ? value.status : 500, headers: noStore });

/** Safe status only: never returns credentials, base URLs, account emails or raw auth source details. */
export async function GET(request: Request) {
  try {
    checkLocalRequest(request);
    const [pi, app] = await Promise.all([getPiRuntime(), getAppRuntime()]);
    const providers = await Promise.all(PROVIDERS.map(async provider => {
      if (provider.unsupported) return { ...provider, connected: false };
      const runtime = provider.sharedPiLogin ? pi : app;
      const sdk = runtime.getProvider(provider.id);
      if (!sdk) return { ...provider, unsupported: true, connected: false, description: '当前 SDK 未提供此服务。' };
      const auth = await runtime.checkAuth(provider.id, { signal: AbortSignal.timeout(5000) }).catch(() => undefined);
      return { ...provider, connected: !!auth, authType: auth?.type,
        canLogout: !provider.sharedPiLogin && runtime.getProviderAuthStatus(provider.id).source === 'stored' };
    }));
    return Response.json({ providers }, { headers: noStore });
  } catch (value) { return error(value); }
}

/** Logout only removes this app's local credential, never Pi CLI credentials or environment variables. */
export async function DELETE(request: Request) {
  try {
    checkLocalRequest(request);
    const body = await readJson(request, 2048) as { provider?: unknown };
    const provider = getProviderDefinition(body.provider);
    if (!provider || provider.sharedPiLogin) throw new InterpretError('此服务不能在网页退出。');
    const app = await getAppRuntime();
    if (app.getProviderAuthStatus(provider.id).source !== 'stored') throw new InterpretError('此服务未在网页保存登录。');
    await app.logout(provider.id, { signal: AbortSignal.timeout(10000) });
    return Response.json({ ok: true }, { headers: noStore });
  } catch (value) { return error(value); }
}
