import { InterpretError } from '@/lib/ai/config';
import { checkLocalRequest } from '@/lib/ai/local-request';
import { getProviderDefinition } from '@/lib/ai/provider-catalog';
import { listProviderModels } from '@/lib/ai/provider-models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  try {
    checkLocalRequest(request);
    const url = new URL(request.url);
    const provider = getProviderDefinition(url.searchParams.get('provider'));
    if (!provider) throw new InterpretError('不支持此模型服务。');
    const result = await listProviderModels(provider.id, {
      refresh: url.searchParams.get('refresh') === '1', signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    });
    return Response.json({ configured: true, provider: provider.id, providerLabel: provider.label, ...result }, { headers: noStore });
  } catch (value) {
    return Response.json({ configured: false, error: value instanceof InterpretError ? value.message : '无法读取模型列表，请检查登录或密钥。' },
      { status: value instanceof InterpretError && value.status === 401 ? 401 : 200, headers: noStore });
  }
}
