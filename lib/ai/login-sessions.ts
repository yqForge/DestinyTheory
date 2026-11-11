import 'server-only';
import { randomBytes } from 'node:crypto';
import type { AuthEvent, AuthPrompt } from '@earendil-works/pi-ai';
import { InterpretError } from './config';
import { getProviderDefinition } from './provider-catalog';
import { appDeviceId, getAppRuntime } from './runtimes';

type PublicPrompt = { id: string; type: AuthPrompt['type']; message: string; placeholder?: string; options?: { id: string; label: string; description?: string }[] };
type PublicEvent = { type: 'auth_url'; url: string; instructions?: string } | { type: 'device_code'; userCode: string; verificationUri: string } | { type: 'progress' | 'info'; message: string };
export interface LoginStatus { id: string; provider: string; method: 'oauth' | 'api_key'; state: 'running' | 'success' | 'error' | 'cancelled'; prompt?: PublicPrompt; events: PublicEvent[]; error?: string }
interface LoginSession extends LoginStatus { abort: AbortController; pending?: { id: string; resolve(value: string): void; reject(error: Error): void }; expires: number }

const sessions = new Map<string, LoginSession>();
const MAX_SESSIONS = 6;
const trustedUrl = (value: string) => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined; } catch { return undefined; } };
const publicLoginError = (error: unknown) => {
  const text = error instanceof Error ? error.message : '';
  if (/EADDRINUSE|Port .* in use/i.test(text)) return '登录回调端口被占用，请先关闭其他未完成的登录后重试。';
  if (/cancel/i.test(text)) return '登录已取消。';
  return '登录未完成，请检查账号、订阅或密钥后重试。';
};
const status = ({ abort: _abort, pending: _pending, expires: _expires, ...value }: LoginSession): LoginStatus => value;

function prune() {
  for (const [id, session] of sessions) if (session.expires < Date.now()) {
    session.abort.abort(); session.pending?.reject(new Error('Login expired')); sessions.delete(id);
  }
}

export function startLogin(provider: unknown, method: unknown): LoginStatus {
  prune();
  const definition = getProviderDefinition(provider);
  if (!definition || definition.sharedPiLogin) throw new InterpretError('此服务不支持从网页登录。');
  if ((method !== 'oauth' && method !== 'api_key') || !definition.auth.includes(method)) throw new InterpretError('不支持此登录方式。');
  if ([...sessions.values()].some(session => session.state === 'running' && session.provider === definition.id)) {
    throw new InterpretError('该服务已有登录流程在进行，请先完成或取消。', 409);
  }
  if (sessions.size >= MAX_SESSIONS) throw new InterpretError('登录流程过多，请稍后重试。', 429);
  const id = randomBytes(24).toString('base64url');
  const abort = new AbortController();
  const session: LoginSession = { id, provider: definition.id, method, state: 'running', events: [], abort, expires: Date.now() + 15 * 60000 };
  sessions.set(id, session);
  const notify = (event: AuthEvent) => {
    let value: PublicEvent | undefined;
    if (event.type === 'auth_url') { const url = trustedUrl(event.url); if (url) value = { type: 'auth_url', url, instructions: event.instructions }; }
    else if (event.type === 'device_code') { const url = trustedUrl(event.verificationUri); if (url) value = { type: 'device_code', userCode: event.userCode, verificationUri: url }; }
    else value = { type: event.type, message: event.message };
    if (value) session.events = [...session.events.slice(-9), value];
  };
  const prompt = (input: AuthPrompt) => new Promise<string>((resolve, reject) => {
    if (session.pending) { reject(new Error('Concurrent prompt')); return; }
    const promptId = randomBytes(12).toString('base64url');
    const clear = () => { if (session.pending?.id === promptId) { session.pending = undefined; session.prompt = undefined; } };
    const onAbort = () => { clear(); reject(new Error('Prompt cancelled')); };
    input.signal?.addEventListener('abort', onAbort, { once: true });
    session.prompt = { id: promptId, type: input.type, message: input.message, ...('placeholder' in input ? { placeholder: input.placeholder } : {}),
      ...(input.type === 'select' ? { options: input.options.map(option => ({ id: option.id, label: option.label, description: option.description })) } : {}) };
    session.pending = { id: promptId, resolve: value => { input.signal?.removeEventListener('abort', onAbort); clear(); resolve(value); },
      reject: error => { input.signal?.removeEventListener('abort', onAbort); clear(); reject(error); } };
  });
  void (async () => {
    try {
      const runtime = await getAppRuntime();
      await runtime.login(definition.id, method, { signal: abort.signal, notify, prompt }, { getDeviceId: appDeviceId, agentName: 'Ziwei Doushu Local' });
      session.state = 'success';
    } catch (error) {
      session.state = abort.signal.aborted ? 'cancelled' : 'error';
      session.error = publicLoginError(error);
    } finally {
      session.pending?.reject(new Error('Login ended'));
      session.prompt = undefined; session.pending = undefined;
      session.expires = Date.now() + 5 * 60000;
    }
  })();
  return status(session);
}

export function loginStatus(id: unknown) {
  prune();
  const session = typeof id === 'string' ? sessions.get(id) : undefined;
  if (!session) throw new InterpretError('登录流程已过期，请重新开始。', 404);
  return status(session);
}

export function answerLogin(id: unknown, promptId: unknown, value: unknown) {
  const session = typeof id === 'string' ? sessions.get(id) : undefined;
  if (!session || session.state !== 'running' || !session.pending || session.pending.id !== promptId) throw new InterpretError('当前登录步骤已变化，请刷新状态。', 409);
  if (typeof value !== 'string' || !value.trim() || value.length > 8192) throw new InterpretError('输入内容无效。');
  if (session.prompt?.type === 'select' && !session.prompt.options?.some(option => option.id === value)) throw new InterpretError('请选择有效选项。');
  session.pending.resolve(value.trim());
  return status(session);
}

export function cancelLogin(id: unknown) {
  const session = typeof id === 'string' ? sessions.get(id) : undefined;
  if (!session) return;
  session.abort.abort(); session.pending?.reject(new Error('Login cancelled'));
  session.state = 'cancelled'; session.prompt = undefined; session.pending = undefined;
}
