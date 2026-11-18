import { describe, expect, it } from 'vitest';
import { computeFreeHours, generateSlots, type SlotEventType } from './slots.js';
import { dateMinToUtc, getParts, zonedToUtc } from './tz.js';

const weekdays = (r: { start: string; end: string }[]) => ({ '1': r, '2': r, '3': r, '4': r, '5': r });

function et(over: Partial<SlotEventType> = {}): SlotEventType {
  return {
    durationMin: 60,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minNoticeHours: 0,
    maxDaysAhead: 60,
    slotIntervalMin: 60,
    availability: weekdays([{ start: '09:00', end: '12:00' }]),
    ...over,
  };
}

const T = (iso: string) => Date.parse(iso);
const starts = (s: { start: string }[]) => s.map((x) => x.start);

describe('tz helpers', () => {
  it('converts Tokyo wall time', () => {
    expect(new Date(zonedToUtc(2024, 11, 18, 9, 0, 'Asia/Tokyo')).toISOString()).toBe('2024-11-18T00:00:00.000Z');
  });
  it('handles NY offset before and after DST', () => {
    expect(new Date(zonedToUtc(2024, 3, 9, 9, 0, 'America/New_York')).toISOString()).toBe('2024-03-09T14:00:00.000Z');
    expect(new Date(zonedToUtc(2024, 3, 11, 9, 0, 'America/New_York')).toISOString()).toBe('2024-03-11T13:00:00.000Z');
    expect(getParts(T('2024-03-11T13:00:00Z'), 'America/New_York').hour).toBe(9);
  });
});

describe('generateSlots (Asia/Tokyo)', () => {
  const base = { timezone: 'Asia/Tokyo', now: T('2024-11-17T00:00:00Z') }; // Sun 09:00 JST
  it('produces slots inside windows only on available weekdays', () => {
    // 2024-11-18 is Monday
    const s = generateSlots({ ...base, eventType: et(), busy: [], fromDate: '2024-11-16', toDate: '2024-11-19' });
    expect(starts(s)).toEqual([
      '2024-11-18T00:00:00.000Z', // 09:00 JST
      '2024-11-18T01:00:00.000Z',
      '2024-11-18T02:00:00.000Z', // 11:00-12:00
      '2024-11-19T00:00:00.000Z',
      '2024-11-19T01:00:00.000Z',
      '2024-11-19T02:00:00.000Z',
    ]);
    expect(s[0].end).toBe('2024-11-18T01:00:00.000Z');
  });
  it('slot must fit fully in window', () => {
    const s = generateSlots({
      ...base,
      eventType: et({ durationMin: 45, slotIntervalMin: 30 }),
      busy: [],
      fromDate: '2024-11-18',
      toDate: '2024-11-18',
    });
    // starts 09:00, 09:30, 10:00, 10:30, 11:00 (ends 11:45); 11:30 would end 12:15
    expect(s).toHaveLength(5);
    expect(s[4].start).toBe('2024-11-18T02:00:00.000Z');
  });
  it('respects minNoticeHours', () => {
    const s = generateSlots({
      timezone: 'Asia/Tokyo',
      now: T('2024-11-18T00:30:00Z'), // 09:30 JST Monday
      eventType: et({ minNoticeHours: 1 }), // earliest 10:30 JST
      busy: [],
      fromDate: '2024-11-18',
      toDate: '2024-11-18',
    });
    expect(starts(s)).toEqual(['2024-11-18T02:00:00.000Z']); // 11:00 JST only (10:00 < 10:30)
  });
  it('respects maxDaysAhead', () => {
    const s = generateSlots({
      ...base,
      eventType: et({ maxDaysAhead: 1 }), // today(Sun)+1 = Mon
      busy: [],
      fromDate: '2024-11-18',
      toDate: '2024-11-30',
    });
    expect(s.every((x) => x.start.startsWith('2024-11-18'))).toBe(true);
    expect(s.length).toBe(3);
  });
  it('removes slots overlapping busy and applies buffers', () => {
    const busy = [{ start: T('2024-11-18T01:00:00Z'), end: T('2024-11-18T02:00:00Z') }]; // 10:00-11:00 JST
    const plain = generateSlots({ ...base, eventType: et(), busy, fromDate: '2024-11-18', toDate: '2024-11-18' });
    expect(starts(plain)).toEqual(['2024-11-18T00:00:00.000Z', '2024-11-18T02:00:00.000Z']);
    const buf = generateSlots({
      ...base,
      eventType: et({ bufferBeforeMin: 15, bufferAfterMin: 15 }),
      busy,
      fromDate: '2024-11-18',
      toDate: '2024-11-18',
    });
    // 09:00-10:00 + 15m after hits busy at 10:00; 11:00 with 15m before hits busy end 11:00
    expect(buf).toEqual([]);
  });
  it('touching intervals do not conflict', () => {
    const busy = [{ start: T('2024-11-18T00:00:00Z'), end: T('2024-11-18T01:00:00Z') }];
    const s = generateSlots({ ...base, eventType: et(), busy, fromDate: '2024-11-18', toDate: '2024-11-18' });
    expect(s).toHaveLength(2);
  });
  it('supports multiple windows per day', () => {
    const s = generateSlots({
      ...base,
      eventType: et({ availability: { '1': [{ start: '09:00', end: '10:00' }, { start: '13:00', end: '14:00' }] } }),
      busy: [],
      fromDate: '2024-11-18',
      toDate: '2024-11-18',
    });
    expect(starts(s)).toEqual(['2024-11-18T00:00:00.000Z', '2024-11-18T04:00:00.000Z']);
  });
  it('empty availability yields no slots', () => {
    expect(generateSlots({ ...base, eventType: et({ availability: {} }), busy: [], fromDate: '2024-11-18', toDate: '2024-11-25' })).toEqual([]);
  });
});

describe('generateSlots (America/New_York across DST)', () => {
  // US DST began Sunday 2024-03-10. Window 09:00-11:00 local every day.
  const everyday = { '0': [{ start: '09:00', end: '11:00' }], '1': [{ start: '09:00', end: '11:00' }], '6': [{ start: '09:00', end: '11:00' }] };
  it('keeps local wall-clock times stable while UTC shifts', () => {
    const s = generateSlots({
      timezone: 'America/New_York',
      now: T('2024-03-01T00:00:00Z'),
      eventType: et({ availability: everyday }),
      busy: [],
      fromDate: '2024-03-09', // Sat (EST)
      toDate: '2024-03-11', // Mon (EDT)
    });
    expect(starts(s)).toEqual([
      '2024-03-09T14:00:00.000Z', // 09:00 EST
      '2024-03-09T15:00:00.000Z',
      '2024-03-10T13:00:00.000Z', // 09:00 EDT
      '2024-03-10T14:00:00.000Z',
      '2024-03-11T13:00:00.000Z',
      '2024-03-11T14:00:00.000Z',
    ]);
  });
  it('handles fall-back day (2024-11-03)', () => {
    const s = generateSlots({
      timezone: 'America/New_York',
      now: T('2024-10-01T00:00:00Z'),
      eventType: et({ availability: everyday }),
      busy: [],
      fromDate: '2024-11-02',
      toDate: '2024-11-04',
    });
    expect(starts(s)).toEqual([
      '2024-11-02T13:00:00.000Z', // EDT
      '2024-11-02T14:00:00.000Z',
      '2024-11-03T14:00:00.000Z', // EST again
      '2024-11-03T15:00:00.000Z',
      '2024-11-04T14:00:00.000Z',
      '2024-11-04T15:00:00.000Z',
    ]);
  });
  it('uses owner-tz "today" for maxDaysAhead', () => {
    // 2024-03-10T03:00Z is still Mar 9 22:00 in New York
    const s = generateSlots({
      timezone: 'America/New_York',
      now: T('2024-03-10T03:00:00Z'),
      eventType: et({ availability: everyday, maxDaysAhead: 0 }),
      busy: [],
      fromDate: '2024-03-09',
      toDate: '2024-03-12',
    });
    // today = Mar 9 (Sat) -> 09:00 EST already passed, nothing
    expect(s).toEqual([]);
  });
});

describe('busy intervals across DST (America/New_York)', () => {
  it('blocks the 09:00 EDT slot using a UTC busy interval on the DST day', () => {
    const everyday = { '0': [{ start: '09:00', end: '11:00' }] };
    const s = generateSlots({
      timezone: 'America/New_York',
      now: T('2024-03-01T00:00:00Z'),
      eventType: et({ availability: everyday }),
      busy: [{ start: T('2024-03-10T13:00:00Z'), end: T('2024-03-10T14:00:00Z') }], // 09:00-10:00 EDT
      fromDate: '2024-03-10',
      toDate: '2024-03-10',
    });
    expect(starts(s)).toEqual(['2024-03-10T14:00:00.000Z']);
  });
});

describe('computeFreeHours', () => {
  it('sums union of windows minus busy', () => {
    const av1 = weekdays([{ start: '09:00', end: '12:00' }]);
    const av2 = weekdays([{ start: '11:00', end: '13:00' }]); // union 09-13 = 4h/day
    // week of Mon 2024-11-18 (Tokyo) -> 5 days * 4h = 20h
    expect(computeFreeHours([av1, av2], [], '2024-11-18', 'Asia/Tokyo')).toBe(20);
    const busy = [{ start: T('2024-11-18T00:00:00Z'), end: T('2024-11-18T01:30:00Z') }]; // 9:00-10:30 JST
    expect(computeFreeHours([av1, av2], busy, '2024-11-18', 'Asia/Tokyo')).toBe(18.5);
  });
  it('returns 0 with no availability', () => {
    expect(computeFreeHours([], [], '2024-11-18', 'Asia/Tokyo')).toBe(0);
  });
});

describe('dateMinToUtc', () => {
  it('supports 24:00 as next midnight', () => {
    expect(new Date(dateMinToUtc('2024-11-18', 1440, 'Asia/Tokyo')).toISOString()).toBe('2024-11-18T15:00:00.000Z');
  });
});
