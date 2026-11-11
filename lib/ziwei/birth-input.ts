import { lunarToSolar, type SolarDate } from './lunar-solar';
import { branchFromSolarMinutes, isValidGregorianDate, resolveZiweiDayOffset, shiftGregorianDate } from './true-solar-time';
import type { BirthInfo, BirthSource } from './types';

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const fail = (message: string): never => { throw new RangeError(message); };
const integer = (value: unknown, min: number, max: number, label: string): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fail(`${label}必须为 ${min}–${max} 的整数`);

export function clockMinutes(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return fail('时间段请输入 HH:mm 格式');
  const [hour, minute] = value.split(':').map(Number);
  return integer(hour, 0, 23, '小时') * 60 + integer(minute, 0, 59, '分钟');
}

/** Validate runtime JSON and discard arbitrary client metadata. */
export function normalizeBirthSource(value: unknown): BirthSource {
  if (!object(value)) return fail('缺少原始出生资料');
  if (value.calendar !== 'solar' && value.calendar !== 'lunar') return fail('请选择公历或农历');
  if (typeof value.isLeapMonth !== 'boolean') return fail('请明确是否为闰月');
  if (value.calendar === 'solar' && value.isLeapMonth) return fail('公历不能标记闰月');
  const common: Pick<BirthSource, 'calendar' | 'year' | 'month' | 'day' | 'isLeapMonth' | 'longitude'> = {
    calendar: value.calendar,
    year: integer(value.year, 1900, 2050, '年份'),
    month: integer(value.month, 1, 12, '月份'),
    day: integer(value.day, 1, 31, '日期'),
    isLeapMonth: value.isLeapMonth,
    ...(value.longitude === undefined ? {} : { longitude: typeof value.longitude === 'number' && Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180
      ? value.longitude : fail('出生地经度应在 −180° 至 180° 之间') }),
  };
  if (value.timeMode === 'exact') return { ...common, timeMode: 'exact', clockHour: integer(value.clockHour, 0, 23, '小时'), clockMinute: integer(value.clockMinute, 0, 59, '分钟') };
  if (value.timeMode === 'unknown') return { ...common, timeMode: 'unknown' };
  if (value.timeMode !== 'range') return fail('出生时间类型无效');
  const start = clockMinutes(value.rangeStart);
  const end = clockMinutes(value.rangeEnd);
  if (typeof value.rangeEndNextDay !== 'boolean') return fail('请明确时间段是否跨至次日');
  const duration = end + (value.rangeEndNextDay ? 1440 : 0) - start;
  if (duration <= 0) return fail('结束时间必须晚于开始时间；跨午夜请勾选“结束在次日”');
  if (duration > 1440) return fail('模糊时间段最多支持 24 小时');
  return { ...common, timeMode: 'range', rangeStart: value.rangeStart as string, rangeEnd: value.rangeEnd as string, rangeEndNextDay: value.rangeEndNextDay };
}

export function sourceSolarDate(input: BirthSource): SolarDate {
  if (input.calendar === 'lunar') {
    const solar = lunarToSolar(input.year, input.month, input.day, input.isLeapMonth);
    if (!solar) return fail('农历日期不存在，请核对当月天数及闰月');
    return solar;
  }
  if (!isValidGregorianDate(input.year, input.month, input.day)) return fail('公历日期不存在');
  return { year: input.year, month: input.month, day: input.day };
}

export const birthCandidateKey = (birth: Pick<BirthInfo, 'year' | 'month' | 'day' | 'hour'>) => `${birth.year}-${birth.month}-${birth.day}-${birth.hour}`;
export const dateText = (date: SolarDate) => `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;

/**
 * One conversion policy for UI and API. Ranges are minute-resolution [start,end).
 * Preserve the existing longitude-only correction; do not silently add equation-of-time or DST.
 */
export function candidatesFromSource(value: unknown, gender: BirthInfo['gender']): BirthInfo[] {
  const source = normalizeBirthSource(value);
  if (gender !== 'male' && gender !== 'female') return fail('请选择有效性别');
  const solarDate = sourceSolarDate(source);
  if (source.timeMode === 'unknown') return [{ ...solarDate, hour: 0, gender, unknownTime: true, source }];
  const start = source.timeMode === 'exact' ? source.clockHour * 60 + source.clockMinute : clockMinutes(source.rangeStart);
  const end = source.timeMode === 'exact' ? start + 1 : clockMinutes(source.rangeEnd) + (source.rangeEndNextDay ? 1440 : 0);
  const offset = ((source.longitude ?? 120) - 120) * 4;
  const candidates = new Map<string, BirthInfo>();
  // Include the end's left limit: fractional longitude offsets can cross a branch
  // inside the final minute. A range covers that entire minute, not just its :00 second.
  const probes = Array.from({ length: end - start }, (_, index) => start + index);
  if (source.timeMode === 'range') probes.push(end - 0.000001);
  for (const minute of probes) {
    const corrected = minute + offset;
    const normalizedMinutes = ((corrected % 1440) + 1440) % 1440;
    const hour = branchFromSolarMinutes(normalizedMinutes);
    const dayOffset = resolveZiweiDayOffset({ dayOffset: Math.floor(corrected / 1440), normalizedMinutes, branch: hour });
    const date = shiftGregorianDate(solarDate, dayOffset);
    const birth: BirthInfo = { ...date, hour, gender, source,
      ...(source.timeMode === 'exact' ? { origInput: { ...solarDate, clockHour: source.clockHour, clockMinute: source.clockMinute } } : {}) };
    candidates.set(birthCandidateKey(birth), birth);
  }
  return [...candidates.values()];
}
