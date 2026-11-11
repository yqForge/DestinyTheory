'use client';
import type { AIModelsState } from '@/lib/ai/use-ai-models';
import AIModelPicker from './AIModelPicker';
import styles from './AIConsent.module.css';

export default function AIConsent({ onConfirm, comparingRange = false, modelState }: {
  onConfirm: () => void; comparingRange?: boolean; modelState: AIModelsState;
}) {
  const { status, ready, refreshModels, refreshProviders, provider, providers } = modelState;

  const label = providers.find(item => item.id === provider)?.label ?? provider;
  const destination = provider === 'github-copilot'
    ? 'GitHub Copilot，使用你的账号额度，可能计入高级请求' : `${label}，可能消耗账号额度或产生 API 费用`;

  return (
    <div className={styles.card}>
      <h3 className={styles.heading}>开启 AI 命盘解读</h3>
      <AIModelPicker state={modelState} />
      <p className={styles.notice}>确认后发送{comparingRange ? '时间范围、全部候选命盘和对话' : '命盘结构和对话'}到{destination}。不会自动读取私人 readme。</p>
      {status && !status.configured && (
        <p className={styles.error} role="alert">{status.error || '请登录账号或配置 API Key。'}</p>
      )}
      <button type="button" className={styles.confirm} disabled={!ready} onClick={onConfirm}>
        同意发送，开始 AI 解读
      </button>
      {status && !status.configured && <button type="button" className={styles.retry} onClick={() => { refreshProviders(); refreshModels(); }}>重新检测连接</button>}
      <details className={styles.details}>
        <summary>查看数据与隐私说明</summary>
        <p>不自动发送表单中的姓名、出生日期和地点；命盘本身及对话仍可能包含隐私，请勿输入不必要的个人资料。
          解读仅作传统文化研究参考，不替代就医或现实决策。本地接口不含合盘 AI。</p>
      </details>
    </div>
  );
}
