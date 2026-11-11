'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AIModelStatus, ModelChoice } from './model-types';

export interface ProviderStatus {
  id: string;
  label: string;
  auth: ('oauth' | 'api_key')[];
  description: string;
  connected: boolean;
  canLogout?: boolean;
  unsupported?: boolean;
  sharedPiLogin?: boolean;
}
const DEFAULT_PROVIDER = 'github-copilot';

export function useAIModels() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [provider, setProviderState] = useState(DEFAULT_PROVIDER);
  const providerRef = useRef(DEFAULT_PROVIDER);
  const [status, setStatus] = useState<AIModelStatus | null>(null);
  const [selectedModel, setSelectedModel] = useState('');
  const selectedRef = useRef('');
  const [providerAttempt, setProviderAttempt] = useState(0);
  const [modelAttempt, setModelAttempt] = useState(0);
  const [loadingModels, setLoadingModels] = useState(true);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const chooseModel = (id: string) => { selectedRef.current = id; setSelectedModel(id); };
  const chooseProvider = (id: string) => {
    providerRef.current = id; setProviderState(id); chooseModel(''); setStatus(null); setModelAttempt(0);
  };

  useEffect(() => {
    const abort = new AbortController();
    setLoadingProviders(true);
    fetch('/api/ai/providers', { cache: 'no-store', signal: abort.signal })
      .then(async response => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!Array.isArray(data?.providers)) throw new Error();
        setProviders(data.providers);
        const current = data.providers.find((item: ProviderStatus) => item.id === providerRef.current && !item.unsupported);
        if (!current) chooseProvider(data.providers.find((item: ProviderStatus) => item.connected)?.id ?? DEFAULT_PROVIDER);
      })
      .catch(() => { if (!abort.signal.aborted) setProviders([]); })
      .finally(() => { if (!abort.signal.aborted) setLoadingProviders(false); });
    return () => abort.abort();
  }, [providerAttempt]);

  useEffect(() => {
    const abort = new AbortController();
    const current = providers.find(item => item.id === provider);
    if (loadingProviders) return () => abort.abort();
    if (!current?.connected) {
      setStatus({ configured: false, provider, models: [], error: current?.unsupported ? current.description : '请先登录账号或保存 API Key。' });
      setLoadingModels(false);
      return () => abort.abort();
    }
    let timedOut = false;
    setLoadingModels(true);
    const timer = setTimeout(() => { timedOut = true; abort.abort(); }, 20000);
    fetch(`/api/ai/models?provider=${encodeURIComponent(provider)}${modelAttempt ? '&refresh=1' : ''}`, { cache: 'no-store', signal: abort.signal })
      .then(async response => {
        const data = await response.json();
        if (typeof data?.configured !== 'boolean') throw new Error();
        if (abort.signal.aborted) return;
        const models: ModelChoice[] = Array.isArray(data.models)
          ? data.models.filter((model: ModelChoice) => typeof model?.id === 'string' && model.id && typeof model.name === 'string') : [];
        const retained = models.some(model => model.id === selectedRef.current);
        const lostSelection = !!selectedRef.current && !retained;
        const preferred = provider === DEFAULT_PROVIDER ? 'gpt-6.1-sol' : undefined;
        chooseModel(retained ? selectedRef.current : !selectedRef.current && preferred && models.some(model => model.id === preferred) ? preferred : '');
        setStatus({ ...data, provider, modelSource: data.source, models, warning: [data.warning,
          lostSelection ? '先前选择的模型已不在目录，请重新选择；不会自动替换为其他模型。' : ''].filter(Boolean).join(' ') });
      })
      .catch(() => {
        if (timedOut || !abort.signal.aborted) setStatus({ configured: false, provider, models: [], error: '无法读取 AI 模型列表，请检查登录、密钥或本地服务后重试。' });
      })
      .finally(() => { clearTimeout(timer); if (!abort.signal.aborted || timedOut) setLoadingModels(false); });
    return () => { clearTimeout(timer); abort.abort(); };
  }, [provider, providers, loadingProviders, modelAttempt]);

  const models = status?.models ?? [];
  const ready = !!status?.configured && !loadingModels && !loadingProviders && models.some(model => model.id === selectedModel);
  const refreshProviders = useCallback(() => setProviderAttempt(value => value + 1), []);
  return {
    providers, provider, providerRef, chooseProvider, loadingProviders, refreshProviders,
    status, models, selectedModel, chooseModel, selectedRef, loadingModels, ready,
    refreshModels: () => setModelAttempt(value => value + 1),
  };
}
export type AIModelsState = ReturnType<typeof useAIModels>;
