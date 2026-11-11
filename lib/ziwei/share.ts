import type { BirthFormState } from '@/components/BirthForm';
import type { BirthInfo, BirthSource, BirthTimeMode } from './types';
import { candidatesFromSource, normalizeBirthSource } from './birth-input';

function isValidLongitude(longitude: number): boolean {
  return Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

/** Legacy name: longitude-only local mean-solar correction, not full apparent solar time. */
export function calcTrueSolarBranch(clockHour: number, clockMinute: number, longitude: number): number {
  const solar = ((clockHour * 60 + clockMinute + (longitude - 120) * 4) % 1440 + 1440) % 1440;
  if (solar >= 1380 || solar < 60) return 0;
  return Math.floor((solar - 60) / 120) + 1;
}

export const formTimeMode = (form: BirthFormState): BirthTimeMode => form.unknownTime ? 'unknown' : form.timeMode ?? 'exact';

export function formToBirthSource(form: BirthFormState): BirthSource {
  const timeMode = formTimeMode(form);
  return normalizeBirthSource({
    calendar: form.calendar ?? 'solar', year: Number(form.year), month: Number(form.month), day: Number(form.day),
    isLeapMonth: (form.calendar ?? 'solar') === 'lunar' && (form.isLeapMonth ?? false),
    longitude: form.longitude,
    timeMode,
    ...(timeMode === 'exact' ? { clockHour: form.clockHour.trim() ? Number(form.clockHour) : NaN, clockMinute: form.clockMinute.trim() ? Number(form.clockMinute) : NaN } : {}),
    ...(timeMode === 'range' ? { rangeStart: form.rangeStart ?? '', rangeEnd: form.rangeEnd ?? '', rangeEndNextDay: form.rangeEndNextDay ?? false } : {}),
  });
}

/** Preserve every possible chart day / branch; never choose a range midpoint. */
export function formToBirthCandidates(form: BirthFormState): BirthInfo[] {
  return candidatesFromSource(formToBirthSource(form), form.gender).map(birth => ({
    ...birth, name: form.name || undefined, province: form.province || undefined,
    city: form.city || undefined, longitude: form.province ? form.longitude : undefined,
  }));
}

/** Single-chart callers must explicitly handle ambiguity instead of silently taking candidate 0. */
export function formToBirthInfo(form: BirthFormState): BirthInfo {
  const candidates = formToBirthCandidates(form);
  if (candidates.length !== 1) throw new RangeError('此时间段对应多个候选盘，请在单人排盘页比较候选时辰');
  return candidates[0];
}

/** Range metadata is serialized as a range, not a fabricated precise clock time. */
export function formToSearchParams(form: BirthFormState): URLSearchParams {
  const p = new URLSearchParams();
  if (form.name) p.set('n', form.name);
  p.set('y', form.year); p.set('m', form.month); p.set('d', form.day);
  if (form.calendar === 'lunar') { p.set('cal', 'lunar'); if (form.isLeapMonth) p.set('leap', '1'); }
  const mode = formTimeMode(form);
  if (mode === 'unknown') p.set('u', '1');
  else if (mode === 'range') {
    p.set('tm', 'range'); p.set('rs', form.rangeStart ?? ''); p.set('re', form.rangeEnd ?? '');
    if (form.rangeEndNextDay) p.set('rn', '1');
  } else { p.set('h', form.clockHour); p.set('mi', form.clockMinute); }
  if (form.province) p.set('p', form.province);
  if (form.city) p.set('c', form.city);
  if (form.longitude !== 120 && isValidLongitude(form.longitude)) p.set('lo', String(form.longitude));
  p.set('g', form.gender === 'male' ? 'm' : 'f');
  return p;
}

export function searchParamsToForm(params: URLSearchParams): Partial<BirthFormState> | null {
  const year = params.get('y'), month = params.get('m'), day = params.get('d');
  if (!year || !month || !day) return null;
  const calendar = params.get('cal') ?? 'solar';
  if (calendar !== 'solar' && calendar !== 'lunar') return null;
  const mode = params.get('u') === '1' ? 'unknown' : params.get('tm') ?? 'exact';
  if (mode !== 'exact' && mode !== 'range' && mode !== 'unknown') return null;
  const rawLongitude = params.get('lo')?.trim();
  const longitude = rawLongitude ? Number(rawLongitude) : 120;
  return {
    name: params.get('n') || '', year, month, day, calendar,
    isLeapMonth: calendar === 'lunar' && params.get('leap') === '1',
    timeMode: mode, unknownTime: mode === 'unknown',
    clockHour: params.get('h') ?? '8', clockMinute: params.get('mi') ?? '0',
    rangeStart: params.get('rs') ?? '', rangeEnd: params.get('re') ?? '', rangeEndNextDay: params.get('rn') === '1',
    province: params.get('p') || '', city: params.get('c') || '',
    longitude: isValidLongitude(longitude) ? longitude : 120,
    gender: params.get('g') === 'f' ? 'female' : 'male',
  };
}
