'use client';
import { useState } from 'react';
import BirthForm, { type BirthFormState } from '@/components/BirthForm';
import BirthCandidates from '@/components/BirthCandidates';
import { birthCandidateKey } from '@/lib/ziwei/birth-input';
import ChartBoard from '@/components/ChartBoard';
import InsightPanel from '@/components/InsightPanel';
import styles from './chart.module.css';
import { generateChart } from '@/lib/ziwei/algorithm';
import type { BirthInfo, ZiweiChart, Palace } from '@/lib/ziwei/types';

/**
 * 命盘页：出生信息表单 → generateChart() 排盘 → 命盘与 AI 解读工作台。
 *
 * 支持本命 / 大限 / 流年切换、模糊时辰多候选盘比较；AI 只在用户确认后经本机
 * /api/interpret 调用所选模型（见 docs/LOCAL-AI.md、docs/AI-PROVIDERS.md）。
 */
export default function ChartPage() {
  const [charts, setCharts] = useState<ZiweiChart[]>([]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [savedForm, setSavedForm] = useState<BirthFormState | null>(null);
  const chart = charts[candidateIndex] ?? null;
  const candidates = charts.map(item => item.birthInfo);
  const selectCandidate = (index: number) => { setCandidateIndex(index); setSelectedPalace(null); };
  const acceptCandidates = (births: BirthInfo[]) => {
    setCharts(births.map(info => generateChart(info)));
    setCandidateIndex(0);
    setActivePane('ai');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);
  // Small screens open the actionable AI pane first; both panes remain mounted when switching.
  const [activePane, setActivePane] = useState<'chart' | 'ai'>('ai');

  // ── 未起盘：展示出生信息表单 ──
  if (!chart) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>紫微斗数排盘</h1>
        <p style={{ color: '#888', marginBottom: 32, fontSize: 14, lineHeight: 1.7 }}>
          输入出生信息，本地排盘引擎即时生成命盘。
          <br />
          （时辰不确定时可选时间段，系统会列出全部候选盘；AI 解读须你确认后才会发送。）
        </p>
        <BirthForm initialData={savedForm ?? undefined} onFormSave={setSavedForm}
          onSubmit={info => acceptCandidates([info])} onCandidatesSubmit={acceptCandidates} />
      </main>
    );
  }

  // ── 已起盘：命盘 + 解读 ──
  return (
    <main className={styles.page}>
      <header className={styles.toolbar}>
        <div>
          <h1>紫微命盘工作台</h1>
          <p>核对命盘后，确认发送即可开始 AI 解读</p>
        </div>
        <button type="button" className={`btn-ghost ${styles.reset}`}
          onClick={() => { setCharts([]); setSelectedPalace(null); }}>
          ← 重新起盘
        </button>
      </header>

      <nav className={styles.switcher} aria-label="工作区切换">
        <button type="button" aria-pressed={activePane === 'chart'} aria-controls="chart-pane"
          onClick={() => setActivePane('chart')}>查看命盘</button>
        <button type="button" aria-pressed={activePane === 'ai'} aria-controls="ai-pane"
          onClick={() => setActivePane('ai')}>AI 解读 / 提问</button>
      </nav>

      <div className={styles.workspace}>
        <section id="chart-pane" className={styles.boardPane} data-active={activePane === 'chart'} aria-label="紫微命盘">
          <BirthCandidates candidates={candidates} selected={candidateIndex} onSelect={selectCandidate} />
          <ChartBoard key={birthCandidateKey(chart.birthInfo)} chart={chart} onPalaceSelect={palace => {
            setSelectedPalace(palace);
            setActivePane('ai');
          }} />
        </section>
        <section id="ai-pane" className={styles.aiPane} data-active={activePane === 'ai'} aria-label="AI 解读工作区">
          <BirthCandidates compact candidates={candidates} selected={candidateIndex} onSelect={selectCandidate} />
          <div className={styles.interpretation}>
            <InsightPanel chart={chart} selectedPalace={selectedPalace} />
          </div>
        </section>
      </div>
    </main>
  );
}
