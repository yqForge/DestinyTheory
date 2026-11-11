'use client';
import { useEffect, useId, useState } from 'react';
import type { AIModelsState } from '@/lib/ai/use-ai-models';
import styles from './AIModelPicker.module.css';

type Prompt = { id: string; type: 'text' | 'secret' | 'select' | 'manual_code'; message: string; placeholder?: string; options?: { id: string; label: string; description?: string }[] };
type LoginState = { id: string; state: 'running' | 'success' | 'error' | 'cancelled'; prompt?: Prompt; events: { type: string; url?: string; message?: string; userCode?: string; verificationUri?: string; instructions?: string }[]; error?: string };

export default function AIProviderConnect({ state, disabled = false }: { state: AIModelsState; disabled?: boolean }) {
  const id = useId();
  const [login, setLogin] = useState<LoginState | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = state.providers.find(provider => provider.id === state.provider);
  useEffect(() => {
    if (!login || login.state !== 'running') return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/ai/login?id=${encodeURIComponent(login.id)}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setLogin(data);
        if (data.state === 'success') state.refreshProviders();
      } catch (value) { setError(value instanceof Error && value.message ? value.message : '无法读取登录状态。'); }
    }, 1000);
    return () => clearInterval(timer);
  }, [login, state]);
  const request = async (url: string, init: RequestInit) => {
    setBusy(true); setError('');
    try {
      const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '操作失败。');
      return data;
    } finally { setBusy(false); }
  };
  const start = async (method: 'oauth' | 'api_key') => {
    try {
      setAnswer('');
      const next = await request('/api/ai/login', { method: 'POST', body: JSON.stringify({ provider: state.provider, method }) });
      setLogin(next);
      if (next.state === 'success') state.refreshProviders();
    }
    catch (value) { setError(value instanceof Error ? value.message : '无法开始登录。'); }
  };
  const submit = async () => {
    if (!login?.prompt || !answer.trim()) return;
    try {
      const next = await request('/api/ai/login', { method: 'POST', body: JSON.stringify({ action: 'answer', id: login.id, promptId: login.prompt.id, value: answer }) });
      setAnswer(''); setLogin(next);
      // The provider status refresh triggers a model-catalog fetch for the newly connected service.
      if (next.state === 'success') state.refreshProviders();
    }
    catch (value) { setError(value instanceof Error ? value.message : '提交失败。'); }
  };
  const cancel = async () => {
    if (!login) return;
    try { await request('/api/ai/login', { method: 'DELETE', body: JSON.stringify({ id: login.id }) }); setLogin({ ...login, state: 'cancelled', prompt: undefined }); } catch { /* best effort */ }
  };
  const logout = async () => {
    if (!window.confirm(`退出本网页保存的 ${current?.label ?? state.provider} 登录或 API Key？`)) return;
    try { await request('/api/ai/providers', { method: 'DELETE', body: JSON.stringify({ provider: state.provider }) }); state.chooseModel(''); state.refreshProviders(); }
    catch (value) { setError(value instanceof Error ? value.message : '退出失败。'); }
  };
  return <div className={styles.connect}>
    <label htmlFor={id}>模型服务</label>
    <select id={id} value={state.provider} disabled={disabled || state.loadingProviders || login?.state === 'running'}
      onChange={event => { setLogin(null); setError(''); state.chooseProvider(event.target.value); }}>
      {state.providers.map(provider => <option key={provider.id} value={provider.id} disabled={provider.unsupported}>
        {provider.label}{provider.unsupported ? '（暂不支持）' : provider.connected ? '（已连接）' : ''}
      </option>)}
    </select>
    {current && <p>{current.description}</p>}
    {current && !current.unsupported && !current.sharedPiLogin && <div className={styles.authActions}>
      {current.auth.includes('oauth') && <button type="button" disabled={disabled || busy || login?.state === 'running'} onClick={() => start('oauth')}>账号登录</button>}
      {current.auth.includes('api_key') && <button type="button" disabled={disabled || busy || login?.state === 'running'} onClick={() => start('api_key')}>配置 API Key</button>}
      {current.canLogout && <button type="button" disabled={disabled || busy} onClick={logout}>退出网页登录</button>}
    </div>}
    {current?.sharedPiLogin && !current.connected && <p role="alert">未检测到 Pi 的 Copilot 登录，请先在 Pi 中执行 /login github-copilot，然后刷新状态。</p>}
    {login && <section className={styles.login} aria-label="模型服务登录">
      {login.events.map((event, index) => <p key={index}>
        {event.type === 'auth_url' && event.url ? <><a href={event.url} target="_blank" rel="noopener noreferrer">打开官方登录页</a>{event.instructions ? ` · ${event.instructions}` : ''}</> : null}
        {event.type === 'device_code' && event.verificationUri ? <>在 <a href={event.verificationUri} target="_blank" rel="noopener noreferrer">官方验证页</a> 输入代码：<strong>{event.userCode}</strong></> : null}
        {event.message}
      </p>)}
      {login.prompt && <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label htmlFor={`${id}-answer`}>{login.prompt.message}</label>
        {login.prompt.type === 'select'
          ? <select id={`${id}-answer`} value={answer} onChange={event => setAnswer(event.target.value)}><option value="">请选择</option>{login.prompt.options?.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
          : <input id={`${id}-answer`} type={login.prompt.type === 'secret' ? 'password' : 'text'} autoComplete="off" value={answer} placeholder={login.prompt.placeholder} onChange={event => setAnswer(event.target.value)} />}
        <button type="submit" disabled={busy || !answer.trim()}>{login.prompt.type === 'secret' ? '保存并连接' : '提交'}</button>
      </form>}
      {login.state === 'running' && <button type="button" onClick={cancel}>取消登录</button>}
      {login.state === 'success' && <p role="status">已连接，正在刷新可用模型。</p>}
      {login.error && <p role="alert">{login.error}</p>}
    </section>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
