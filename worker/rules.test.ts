import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusyRule, Settings } from '../shared/types';
import { getBusy, resetBusyCache, resetIcsCache } from './data';
import type { Env } from './env';
import { activeRules, expandRules, ruleMatches, rulePadMs, type TaggedEvent } from './rules';
import { validateBusyRules, validateSettingsInput } from './validate';

const rule = (o: Partial<BusyRule> = {}): BusyRule => ({
  id: 'r1', label: '学校のあと', calendarId: '', keyword: '', beforeMin: 0, afterMin: 90, enabled: true, ...o,
});
const ev = (o: Partial<TaggedEvent> = {}): TaggedEvent => ({
  calendarId: 'primary', title: '学校 授業', start: Date.parse('2024-11-18T00:00:00Z'), end: Date.parse('2024-11-18T06:00:00Z'), ...o,
});

describe('ruleMatches', () => {
  it('keyword is case-insensitive and NFKC-normalised (full/half width)', () => {
    expect(ruleMatches(rule({ keyword: '学校' }), ev())).toBe(true);
    expect(ruleMatches(rule({ keyword: 'ＳＣＨＯＯＬ' }), ev({ title: 'school event' }))).toBe(true);
    expect(ruleMatches(rule({ keyword: 'school' }), ev({ title: 'ＳＣＨＯＯＬ ｲﾍﾞﾝﾄ' }))).toBe(true);
    expect(ruleMatches(rule({ keyword: 'ｲﾍﾞﾝﾄ' }), ev({ title: 'イベント' }))).toBe(true);
    expect(ruleMatches(rule({ keyword: '会議' }), ev())).toBe(false);
  });
  it('calendarId only, and calendarId + keyword (both must hold)', () => {
    expect(ruleMatches(rule({ calendarId: 'primary' }), ev())).toBe(true);
    expect(ruleMatches(rule({ calendarId: 'other' }), ev())).toBe(false);
    expect(ruleMatches(rule({ calendarId: 'primary', keyword: '学校' }), ev())).toBe(true);
    expect(ruleMatches(rule({ calendarId: 'other', keyword: '学校' }), ev())).toBe(false);
    expect(ruleMatches(rule({ calendarId: 'primary', keyword: '会議' }), ev())).toBe(false);
    expect(ruleMatches(rule({ calendarId: 'ics:http://x/a.ics' }), ev({ calendarId: 'ics:http://x/a.ics' }))).toBe(true);
  });
  it('a rule with neither calendar nor keyword matches nothing; disabled rules are ignored', () => {
    expect(ruleMatches(rule(), ev())).toBe(false);
    expect(ruleMatches(rule({ keyword: '学校', enabled: false }), ev())).toBe(false);
    expect(activeRules([rule({ keyword: '学校', enabled: false }), rule({ id: 'b', keyword: 'x' })]).map((r) => r.id)).toEqual(['b']);
  });
});

describe('expandRules / rulePadMs', () => {
  it('expands to [start - before, end + after]', () => {
    const [x] = expandRules([rule({ keyword: '学校', beforeMin: 30, afterMin: 90 })], [ev()]);
    expect(x.block).toEqual({ start: Date.parse('2024-11-17T23:30:00Z'), end: Date.parse('2024-11-18T07:30:00Z') });
  });
  it('pad is the max margin of enabled rules', () => {
    expect(rulePadMs(activeRules([rule({ keyword: 'a', beforeMin: 30, afterMin: 90 }), rule({ id: 'b', keyword: 'b', beforeMin: 120 }), rule({ id: 'c', keyword: 'c', beforeMin: 600, enabled: false })]))).toBe(120 * 60000);
    expect(rulePadMs([])).toBe(0);
  });
});

describe('validateBusyRules', () => {
  const ok = { id: 'a', label: 'x', calendarId: '', keyword: '学校', beforeMin: 0, afterMin: 90, enabled: true };
  const err = (v: unknown, g = ['primary'], u: string[] = []) => { try { validateBusyRules(v, g, u); return ''; } catch (e) { return (e as Error).message; } };
  it('accepts valid rules', () => {
    expect(validateBusyRules([ok, { ...ok, id: 'b', keyword: '', calendarId: 'primary' }, { ...ok, id: 'c', calendarId: 'ics:http://x/a.ics' }], ['primary'], ['http://x/a.ics'])).toHaveLength(3);
  });
  it('rejects invalid rules in Japanese', () => {
    expect(err([ok, ok])).toContain('重複');
    expect(err(new Array(21).fill(0).map((_, i) => ({ ...ok, id: String(i) })))).toContain('20件');
    expect(err([{ ...ok, keyword: '', calendarId: '' }])).toContain('どちらか');
    expect(err([{ ...ok, calendarId: 'unknown' }])).toContain('対象カレンダー');
    expect(err([{ ...ok, calendarId: 'ics:http://nope' }])).toContain('対象カレンダー');
    expect(err([{ ...ok, afterMin: 721 }])).toContain('0〜720');
    expect(err([{ ...ok, beforeMin: 1.5 }])).toContain('0〜720');
    expect(err([{ ...ok, id: '' }])).toContain('ルールID');
    expect(err([{ ...ok, label: 'x'.repeat(61) }])).toContain('60文字');
    expect(err([{ ...ok, keyword: 'x'.repeat(61) }])).toContain('60文字');
    expect(err('nope')).toContain('形式');
  });
  it('settings input defaults busyRules to []', () => {
    expect(validateSettingsInput({ timezone: 'Asia/Tokyo', ownerName: '' }).busyRules).toEqual([]);
  });
});

describe('getBusy with rules (ICS feed)', () => {
  const ICS = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nSUMMARY:学校 授業\r\nDTSTART:20241118T000000Z\r\nDTEND:20241118T060000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
  const url = 'http://x/a.ics';
  const settings = (rules: BusyRule[]): Settings => ({
    ownerName: '', timezone: 'Asia/Tokyo', googleConnected: false, googleEmail: '', googleCalendarIds: ['primary'],
    googleTargetCalendarId: 'primary', icsUrls: [url], busyRules: rules,
  });
  const stmt = { bind: () => stmt, first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) };
  const env = { DB: { prepare: () => stmt } } as unknown as Env;
  beforeEach(() => { resetIcsCache(); resetBusyCache(); vi.stubGlobal('fetch', vi.fn(async () => new Response(ICS))); });
  afterEach(() => vi.unstubAllGlobals());

  it('adds the after-block, and an event just outside the window still blocks into it (window expansion)', async () => {
    // Query only 06:00-08:00Z; the event ended at 06:00Z, rule blocks until 07:30Z.
    const from = Date.parse('2024-11-18T06:00:00Z');
    const to = Date.parse('2024-11-18T08:00:00Z');
    const busy = await getBusy(env, settings([rule({ keyword: '学校' })]), from, to, { strict: true });
    expect(busy).toContainEqual({ start: Date.parse('2024-11-18T00:00:00Z'), end: Date.parse('2024-11-18T07:30:00Z') });
  });
  it('disabled rule or non-matching keyword adds nothing', async () => {
    const from = Date.parse('2024-11-18T06:00:00Z');
    const to = Date.parse('2024-11-18T08:00:00Z');
    expect(await getBusy(env, settings([rule({ keyword: '学校', enabled: false })]), from, to, { strict: true })).toEqual([]);
    const none = await getBusy(env, settings([rule({ keyword: '会議' })]), from, to, { strict: true });
    expect(none.some((b) => b.end > Date.parse('2024-11-18T06:00:00Z'))).toBe(false);
  });
  it('matches by ICS calendar id and stays fail-closed', async () => {
    const from = Date.parse('2024-11-18T00:00:00Z');
    const to = Date.parse('2024-11-18T10:00:00Z');
    const busy = await getBusy(env, settings([rule({ calendarId: `ics:${url}` })]), from, to, { strict: true });
    expect(busy.some((b) => b.end === Date.parse('2024-11-18T07:30:00Z'))).toBe(true);
    resetIcsCache();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    await expect(getBusy(env, settings([rule({ keyword: '学校' })]), from, to, { strict: true })).rejects.toMatchObject({ status: 503 });
  });
});
