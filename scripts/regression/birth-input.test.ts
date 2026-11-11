import assert from 'node:assert/strict';
import { birthCandidateKey, candidatesFromSource, normalizeBirthSource, sourceSolarDate } from '../../lib/ziwei/birth-input';
import { formToBirthCandidates, formToBirthInfo, formToSearchParams, searchParamsToForm } from '../../lib/ziwei/share';
import { generateChart } from '../../lib/ziwei/algorithm';
import type { BirthSource } from '../../lib/ziwei/types';
import type { BirthFormState } from '../../components/BirthForm';

const exact: BirthSource = { calendar: 'solar', year: 2000, month: 2, day: 5, isLeapMonth: false, timeMode: 'exact', clockHour: 10, clockMinute: 0 };
const range = (rangeStart: string, rangeEnd: string, extra: object = {}): BirthSource => ({ ...exact, timeMode: 'range', rangeStart, rangeEnd, rangeEndNextDay: false, ...extra } as BirthSource);
const keys = (source: BirthSource) => candidatesFromSource(source, 'male').map(birthCandidateKey);
const lunar: BirthSource = { ...exact, calendar: 'lunar', year: 2000, month: 1, day: 1 };
assert.deepEqual(sourceSolarDate(lunar), { year: 2000, month: 2, day: 5 });
const solarChart = generateChart(candidatesFromSource(exact, 'male')[0]);
const lunarChart = generateChart(candidatesFromSource(lunar, 'male')[0]);
assert.deepEqual(solarChart.palaces, lunarChart.palaces, 'same instant, same chart regardless of input calendar');
const leap: BirthSource = { ...lunar, year: 2023, month: 2, day: 1, isLeapMonth: true };
assert.deepEqual(sourceSolarDate(leap), { year: 2023, month: 3, day: 22 });
// Independent ICU Chinese-calendar verification of known lunar/solar fixtures.
for (const [source, solar] of [[lunar, '2000-02-05'], [leap, '2023-03-22']] as const) {
  const parts = new Intl.DateTimeFormat('en-u-ca-chinese', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'Asia/Shanghai' }).formatToParts(new Date(solar + 'T12:00:00+08:00'));
  assert.equal(parts.find(p => (p.type as string) === 'relatedYear')?.value, String(source.year));
  assert.equal(parts.find(p => p.type === 'day')?.value, String(source.day));
  assert.equal(parseInt(parts.find(p => p.type === 'month')!.value), source.month);
  assert.equal(parts.find(p => p.type === 'month')!.value.includes('bis'), source.isLeapMonth);
}
assert.throws(() => candidatesFromSource({ ...leap, month: 3 }, 'male'), /农历日期不存在/);
assert.throws(() => candidatesFromSource({ ...leap, day: 30 }, 'male'), /农历日期不存在/);
assert.throws(() => candidatesFromSource({ ...lunar, isLeapMonth: true }, 'male'), /农历日期不存在/);
assert.throws(() => candidatesFromSource({ ...exact, day: 30 }, 'male'), /公历日期不存在/);
assert.throws(() => normalizeBirthSource({ ...exact, year: '2000' }), /年份/);
assert.throws(() => normalizeBirthSource({ ...exact, isLeapMonth: true }), /公历/);
assert.throws(() => normalizeBirthSource({ ...exact, clockHour: 24 }), /小时/);
assert.throws(() => normalizeBirthSource({ ...exact, longitude: NaN }), /经度/);
assert.throws(() => normalizeBirthSource({ ...exact, longitude: -181 }), /经度/);
assert.throws(() => normalizeBirthSource(range('9:00', '11:00')), /HH:mm/);
assert.throws(() => normalizeBirthSource(range('11:00', '09:00')), /跨午夜/);
assert.throws(() => normalizeBirthSource(range('09:00', '09:00')), /结束时间/);
assert.throws(() => normalizeBirthSource(range('09:00', '10:00', { rangeEndNextDay: true })), /24 小时/);
assert.deepEqual(keys(range('09:00', '11:00')), ['2000-2-5-5']);
assert.deepEqual(keys(range('09:00', '11:01')), ['2000-2-5-5', '2000-2-5-6']);
assert.deepEqual(keys(range('08:59', '09:01')), ['2000-2-5-4', '2000-2-5-5']);
assert.deepEqual(keys(range('09:00', '11:00', { longitude: 116.4 })), ['2000-2-5-4', '2000-2-5-5']);
assert.deepEqual(keys(range('09:14', '09:15', { longitude: 116.4 })), ['2000-2-5-4', '2000-2-5-5'], 'fractional corrections must include the final minute after its branch boundary');
assert.deepEqual(keys(range('22:30', '01:30', { year: 2000, month: 1, day: 31, rangeEndNextDay: true })), ['2000-1-31-11', '2000-2-1-0', '2000-2-1-1']);
assert.deepEqual(keys(range('23:00', '01:00', { year: 2000, month: 12, day: 31, rangeEndNextDay: true })), ['2001-1-1-0'], 'late/early Zi on an overnight range collapse to the same chart date');
const allDay = candidatesFromSource(range('00:00', '00:00', { rangeEndNextDay: true }), 'male');
assert.equal(allDay.length, 13);
for (const candidate of allDay) assert.equal(candidate.origInput, undefined, 'a range must not fabricate a precise clock minute');
assert.equal(new Set(allDay.map(birthCandidateKey)).size, allDay.length);
const unknown = candidatesFromSource({ ...exact, timeMode: 'unknown' }, 'male')[0];
assert.equal(unknown.unknownTime, true);
assert.equal(unknown.source?.timeMode, 'unknown');
assert.deepEqual(candidatesFromSource({ ...exact, year: 2000, month: 1, day: 31, clockHour: 23, clockMinute: 30 }, 'male')[0].origInput,
  { year: 2000, month: 1, day: 31, clockHour: 23, clockMinute: 30 });

const form: BirthFormState = { name: '', calendar: 'lunar', year: '2000', month: '1', day: '1', isLeapMonth: false,
  timeMode: 'range', rangeStart: '09:00', rangeEnd: '11:00', rangeEndNextDay: false,
  clockHour: '8', clockMinute: '0', gender: 'male', unknownTime: false, province: '测试', city: '', longitude: 116.4 };
assert.equal(formToBirthCandidates(form).length, 2);
assert.throws(() => formToBirthInfo(form), /多个候选盘/);
const params = formToSearchParams(form);
assert.equal(params.has('h'), false);
assert.equal(params.has('mi'), false);
assert.equal(params.get('cal'), 'lunar');
const restored = searchParamsToForm(params)!;
assert.equal(restored.timeMode, 'range');
assert.equal(restored.rangeStart, '09:00');
assert.deepEqual(formToBirthCandidates({ ...form, ...restored }).map(birthCandidateKey), formToBirthCandidates(form).map(birthCandidateKey));
assert.equal(searchParamsToForm(new URLSearchParams('y=2000&m=1&d=1&cal=invalid')), null);
assert.equal(searchParamsToForm(new URLSearchParams('y=2000&m=1&d=1&tm=invalid')), null);
console.log('✓ 农历/闰月与 ICU 交叉核验、时间段边界/经度小数/跨日跨年、候选去重、原始输入与分享链接回归通过');
