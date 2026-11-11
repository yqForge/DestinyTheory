'use client';
import { useState, useMemo, useEffect, useId } from 'react';
import type { BirthInfo, BirthCalendar, BirthTimeMode } from '@/lib/ziwei/types';
import { BRANCHES } from '@/lib/ziwei/constants';
import { PROVINCES } from '@/lib/ziwei/cities';
import { formToBirthInfo, formToBirthCandidates, formToBirthSource, formTimeMode } from '@/lib/ziwei/share';
import { sourceSolarDate, dateText } from '@/lib/ziwei/birth-input';
import { lunarMonthDayCount, leapMonthOfLunarYear } from '@/lib/ziwei/lunar-solar';
import styles from './BirthForm.module.css';

export interface BirthFormState {
  name: string;
  year: string;
  month: string;
  day: string;
  clockHour: string;
  clockMinute: string;
  unknownTime: boolean;
  province: string;
  city: string;
  longitude: number;
  gender: 'male' | 'female';
  calendar?: BirthCalendar;
  isLeapMonth?: boolean;
  timeMode?: BirthTimeMode;
  rangeStart?: string;
  rangeEnd?: string;
  rangeEndNextDay?: boolean;
}

interface BirthFormProps {
  onSubmit: (info: BirthInfo) => void;
  onCandidatesSubmit?: (candidates: BirthInfo[]) => void;
  loading?: boolean;
  initialData?: Partial<BirthFormState>;
  onFormSave?: (data: BirthFormState) => void;
  hideSubmit?: boolean;
  allowTimeRange?: boolean;
}

const LUNAR_MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const lunarDayName = (day: number) => day <= 10 ? `初${['一','二','三','四','五','六','七','八','九','十'][day - 1]}`
  : day < 20 ? `十${['一','二','三','四','五','六','七','八','九'][day - 11]}`
  : day === 20 ? '二十' : day < 30 ? `廿${['一','二','三','四','五','六','七','八','九'][day - 21]}` : '三十';

export default function BirthForm({ onSubmit, onCandidatesSubmit, loading, initialData, onFormSave, hideSubmit, allowTimeRange = true }: BirthFormProps) {
  const id = useId();
  const [form, setForm] = useState<BirthFormState>({
    name: initialData?.name ?? '', year: initialData?.year ?? '', month: initialData?.month ?? '', day: initialData?.day ?? '',
    clockHour: initialData?.clockHour ?? '8', clockMinute: initialData?.clockMinute ?? '0',
    unknownTime: initialData?.unknownTime ?? initialData?.timeMode === 'unknown',
    province: initialData?.province ?? '', city: initialData?.city ?? '', longitude: initialData?.longitude ?? 120,
    gender: initialData?.gender ?? 'male', calendar: initialData?.calendar ?? 'solar', isLeapMonth: initialData?.isLeapMonth ?? false,
    timeMode: initialData?.unknownTime ? 'unknown' : initialData?.timeMode ?? 'exact',
    rangeStart: initialData?.rangeStart ?? '', rangeEnd: initialData?.rangeEnd ?? '', rangeEndNextDay: initialData?.rangeEndNextDay ?? false,
  });
  const [attempted, setAttempted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  useEffect(() => { onFormSave?.({ ...form }); }, [form, onFormSave]);
  const update = (patch: Partial<BirthFormState>) => { setForm(previous => ({ ...previous, ...patch })); setSubmitError(''); };
  const mode = formTimeMode(form);
  const year = Number(form.year), month = Number(form.month);
  const maxYear = Math.min(new Date().getFullYear(), 2050);
  const leapMonth = useMemo(() => leapMonthOfLunarYear(year), [year]);
  const days = form.calendar === 'lunar' ? lunarMonthDayCount(year, month, form.isLeapMonth) || 30
    : form.year && form.month ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 31;
  const cities = PROVINCES.find(province => province.name === form.province)?.cities ?? [];
  const preview = useMemo(() => {
    try {
      const source = formToBirthSource(form);
      const solar = sourceSolarDate(source);
      return { solar, candidates: formToBirthCandidates(form), error: '' };
    } catch (error) { return { solar: null, candidates: [] as BirthInfo[], error: error instanceof Error ? error.message : '请核对出生资料' }; }
  }, [form]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (preview.error) return;
    try {
      onFormSave?.({ ...form });
      if (onCandidatesSubmit) onCandidatesSubmit(formToBirthCandidates(form));
      else onSubmit(formToBirthInfo(form));
    } catch (error) { setSubmitError(error instanceof Error ? error.message : '排盘失败，请检查输入'); }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-label="出生信息表单">
      <h3 className={styles.title}>填写出生资料</h3>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`${id}-name`}>姓名（可选）</label>
        <input id={`${id}-name`} className={styles.control} placeholder="请输入姓名" value={form.name} onChange={event => update({ name: event.target.value })} />
      </div>

      <fieldset className={styles.field}>
        <legend>出生日期</legend>
        <div className={styles.choices}>
          {(['solar', 'lunar'] as const).map(calendar => <label key={calendar}>
            <input type="radio" name={`${id}-calendar`} checked={form.calendar === calendar} onChange={() => {
              if (form.calendar !== calendar) { update({ calendar, year: '', month: '', day: '', isLeapMonth: false }); setAttempted(false); }
            }} />{calendar === 'solar' ? '公历（阳历）' : '农历（阴历）'}
          </label>)}
        </div>
        <p className={styles.note}>切换历法后请重新填写日期，避免将同一组数字误当作另一种历法。</p>
        <div className={styles.grid3}>
          <select className={styles.control} aria-label="出生年份" value={form.year} onChange={event => update({ year: event.target.value })}>
            <option value="">年份</option>
            {Array.from({ length: maxYear - 1899 }, (_, i) => maxYear - i).map(value => <option key={value} value={value}>{value}年</option>)}
          </select>
          <select className={styles.control} aria-label="出生月份" value={form.month} onChange={event => update({ month: event.target.value })}>
            <option value="">月份</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(value => <option key={value} value={value}>{form.calendar === 'lunar' ? `${LUNAR_MONTHS[value - 1]}月` : `${value}月`}</option>)}
          </select>
          <select className={styles.control} aria-label="出生日期" value={form.day} onChange={event => update({ day: event.target.value })}>
            <option value="">日期</option>
            {Array.from({ length: days }, (_, i) => i + 1).map(value => <option key={value} value={value}>{form.calendar === 'lunar' ? lunarDayName(value) : `${value}日`}</option>)}
          </select>
        </div>
        {form.calendar === 'lunar' && <>
          <label className={styles.check}><input type="checkbox" checked={!!form.isLeapMonth} onChange={event => update({ isLeapMonth: event.target.checked })} />这是闰月出生</label>
          <p className={styles.note}>{form.year ? leapMonth ? `${year}年有闰${LUNAR_MONTHS[leapMonth - 1]}月，普通月份请勿勾选闰月。` : `${year}年没有闰月。` : '先选择年份，再核对闰月。'}农历月天数按历法校验，不会把不存在的日期自动顺延。</p>
        </>}
      </fieldset>

      <fieldset className={styles.field}>
        <legend>出生地点（可选，用于经度修正）</legend>
        <div className={styles.grid2}>
          <select className={styles.control} aria-label="出生省份" value={form.province} onChange={event => {
            const province = PROVINCES.find(item => item.name === event.target.value);
            const city = province?.cities[0];
            update({ province: event.target.value, city: city?.name ?? '', longitude: city?.longitude ?? 120 });
          }}>
            <option value="">不校正 / 选择省份</option>
            {PROVINCES.map(province => <option key={province.name} value={province.name}>{province.name}</option>)}
          </select>
          <select className={styles.control} aria-label="出生城市" value={form.city} disabled={!form.province} onChange={event => update({ city: event.target.value, longitude: cities.find(city => city.name === event.target.value)?.longitude ?? 120 })}>
            <option value="">{form.province ? '选择城市' : '先选省份'}</option>
            {cities.map(city => <option key={city.name} value={city.name}>{city.name}</option>)}
          </select>
        </div>
        <p className={styles.note}>{form.province ? `经度 ${form.longitude.toFixed(1)}°，修正约 ${Math.round((form.longitude - 120) * 4)} 分钟。` : '未选出生地，保持北京时间。'}当前仅作经度修正（地方平太阳时），未计入均时差，不自动处理历史夏令时。</p>
      </fieldset>

      <fieldset className={styles.field}>
        <legend>出生时间（北京时间标准时）</legend>
        <div className={styles.choices}>
          {(['exact', ...(allowTimeRange ? ['range'] : []), 'unknown'] as BirthTimeMode[]).map(timeMode => <label key={timeMode}>
            <input type="radio" name={`${id}-time-mode`} checked={mode === timeMode} onChange={() => update({ timeMode, unknownTime: timeMode === 'unknown' })} />
            {timeMode === 'exact' ? '精确时间' : timeMode === 'range' ? '模糊时间段' : '完全不详'}
          </label>)}
        </div>
        {mode === 'exact' && <div className={styles.grid2}>
          <select className={styles.control} aria-label="出生小时" value={form.clockHour} onChange={event => update({ clockHour: event.target.value })}>
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}时</option>)}
          </select>
          <select className={styles.control} aria-label="出生分钟" value={form.clockMinute} onChange={event => update({ clockMinute: event.target.value })}>
            {Array.from({ length: 60 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}分</option>)}
          </select>
        </div>}
        {mode === 'range' && <>
          <div className={styles.grid2}>
            <div><label className={styles.label} htmlFor={`${id}-start`}>开始时间</label><input id={`${id}-start`} className={styles.control} type="time" step={60} value={form.rangeStart} onChange={event => update({ rangeStart: event.target.value })} /></div>
            <div><label className={styles.label} htmlFor={`${id}-end`}>结束时间</label><input id={`${id}-end`} className={styles.control} type="time" step={60} value={form.rangeEnd} onChange={event => update({ rangeEnd: event.target.value })} /></div>
          </div>
          <label className={styles.check}><input type="checkbox" checked={!!form.rangeEndNextDay} onChange={event => update({ rangeEndNextDay: event.target.checked })} />结束在次日（跨午夜）</label>
          <button type="button" className={styles.example} onClick={() => update({ rangeStart: '09:00', rangeEnd: '11:00', rangeEndNextDay: false })}>填入示例：9点–11点</button>
          <p className={styles.note}>包含起点、不包含终点，例如 09:00–11:00 不含 11:00 整。最多 24 小时，按分钟枚举候选；不取中点，不伪造出生分钟。经度修正或跨日可能产生多张候选盘。</p>
        </>}
        {mode === 'unknown' && <p className={styles.note}>子时仅作盘面展示占位，不代表已知出生时辰；AI 不会对占位盘作确定性解读。如知道大致范围，请选择“模糊时间段”。</p>}
      </fieldset>

      <fieldset className={styles.field}>
        <legend>性别</legend>
        <div className={styles.choices}>
          {(['male', 'female'] as const).map(gender => <label key={gender}><input type="radio" name={`${id}-gender`} checked={form.gender === gender} onChange={() => update({ gender })} />{gender === 'male' ? '男' : '女'}</label>)}
        </div>
      </fieldset>

      {preview.solar && !preview.error && <div className={styles.preview} role="status" aria-label="出生资料预览">
        <p>{form.calendar === 'lunar' ? '农历换算公历' : '公历出生日期'}：{dateText(preview.solar)}</p>
        <p>{mode === 'range' ? `原始时间范围：${form.rangeStart}—${form.rangeEndNextDay ? '次日 ' : ''}${form.rangeEnd}（不含终点）` : mode === 'unknown' ? '出生时辰未知，仅展示占位' : `原始钟表时间：${form.clockHour.padStart(2, '0')}:${form.clockMinute.padStart(2, '0')}`}</p>
        {mode !== 'unknown' && <p>候选盘 {preview.candidates.length} 张：{preview.candidates.map(item => `${dateText(item)} ${BRANCHES[item.hour]}时`).join('；')}</p>}
      </div>}
      {(attempted && preview.error || submitError) && <p role="alert" className={styles.error}>{submitError || preview.error}</p>}
      {!hideSubmit && <button className={styles.submit} type="submit" disabled={loading}>{loading ? '正在起盘…' : '立即起盘 · 解命运密码'}</button>}
    </form>
  );
}
