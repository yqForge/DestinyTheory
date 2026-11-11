'use client';
import { useId, useRef } from 'react';
import type { AIModelsState } from '@/lib/ai/use-ai-models';
import styles from './AIModelPicker.module.css';
import AIProviderConnect from './AIProviderConnect';

export default function AIModelPicker({ state, disabled = false }: { state: AIModelsState; disabled?: boolean }) {
  const id = useId();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const { status, models, selectedModel, loadingModels, chooseModel, refreshModels, providers, provider } = state;
  const providerLabel = providers.find(item => item.id === provider)?.label ?? status?.providerLabel ?? provider;
  return <details ref={detailsRef} className={styles.picker} aria-label="解读模型选择">
    <summary>
      <span role="status">{loadingModels ? '正在获取可选模型…' : status?.configured
        ? `${providerLabel} / ${selectedModel || '请选择模型'}` : `${providerLabel} / 未连接`}</span>
      <span className={styles.action}>登录 / 模型</span>
    </summary>
    <div className={styles.body}>
      <AIProviderConnect state={state} disabled={disabled} />
      <label htmlFor={id}>选择解读模型</label>
      <div className={styles.row}>
        <select id={id} value={selectedModel} disabled={disabled || loadingModels || !models.length}
          onChange={event => { chooseModel(event.target.value); if (detailsRef.current) detailsRef.current.open = false; }}>
          {(!selectedModel || !models.length) && <option value="">{models.length ? '请选择模型' : '暂无可选模型'}</option>}
          {models.map(model => <option key={model.id} value={model.id}>{model.name} · {model.id}</option>)}
        </select>
        <button type="button" disabled={disabled || loadingModels || !providers.find(item => item.id === provider)?.connected} onClick={refreshModels}>
          刷新模型列表
        </button>
      </div>
      <p>{status?.modelSource === 'copilot-live' ? '来源：Copilot 账号目录（短时缓存）。' : status?.modelSource === 'sdk-catalog' ? '来源：Pi SDK 服务商目录。' : '来源：尚未连接。'}切换只影响下一次发送，不会自动解读或修改 Pi 的默认模型。</p>
      {status?.checkedAt && <p>列表时间：{new Date(status.checkedAt).toLocaleTimeString()}</p>}
      {status?.warning && <p>{status.warning}</p>}
      {status?.error && <p role="alert">{status.error}</p>}
      {disabled && <p>正在生成，请先等待完成或停止生成后切换。</p>}
    </div>
  </details>;
}
