'use client';
import { useId } from 'react';
import type { BirthInfo } from '@/lib/ziwei/types';
import { BRANCHES } from '@/lib/ziwei/constants';
import { dateText } from '@/lib/ziwei/birth-input';
import styles from './BirthCandidates.module.css';

export default function BirthCandidates({ candidates, selected, onSelect, compact = false }: {
  candidates: BirthInfo[]; selected: number; onSelect: (index: number) => void; compact?: boolean;
}) {
  const id = useId();
  const source = candidates[0]?.source;
  if (!source || source.timeMode !== 'range') return null;
  return <details className={styles.box} aria-label="模糊时间候选盘" open={!compact}>
    <summary>时间段 {source.rangeStart}—{source.rangeEndNextDay ? '次日 ' : ''}{source.rangeEnd} · {candidates.length} 张候选（当前 {selected + 1}）</summary>
    <p>原始范围：{source.rangeStart}—{source.rangeEndNextDay ? '次日 ' : ''}{source.rangeEnd}（不含终点）</p>
    <label htmlFor={id}>查看候选命盘（共 {candidates.length} 张）</label>
    <select id={id} value={selected} onChange={event => onSelect(Number(event.target.value))}>
      {candidates.map((birth, index) => <option key={index} value={index}>候选 {index + 1}：排盘日 {dateText(birth)} · {BRANCHES[birth.hour]}时</option>)}
    </select>
    <p className={styles.note}>{candidates.length > 1 ? '切换仅用于预览，不表示时辰已确定；AI 会比较全部候选盘。' : '此范围内紫微盘面一致，出生分钟仍未知。'}</p>
  </details>;
}
