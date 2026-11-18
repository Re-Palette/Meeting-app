import { describe, expect, it } from 'vitest';
import { parseIcs } from './ics';

const wrap = (...events: string[]) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.map((e) => `BEGIN:VEVENT\r\n${e}\r\nEND:VEVENT`), 'END:VCALENDAR'].join('\r\n');

const opts = {
  from: Date.parse('2024-11-01T00:00:00Z'),
  to: Date.parse('2024-12-31T00:00:00Z'),
  defaultTz: 'Asia/Tokyo',
};
const iso = (ms: number) => new Date(ms).toISOString();

describe('parseIcs', () => {
  it('parses UTC events', () => {
    const r = parseIcs(wrap('UID:a\r\nSUMMARY:Meeting\r\nDTSTART:20241118T010000Z\r\nDTEND:20241118T020000Z'), opts);
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe('Meeting');
    expect(iso(r[0].start)).toBe('2024-11-18T01:00:00.000Z');
    expect(iso(r[0].end)).toBe('2024-11-18T02:00:00.000Z');
  });

  it('parses TZID events, including DST zones', () => {
    const r = parseIcs(
      wrap('UID:b\r\nDTSTART;TZID=America/New_York:20240311T090000\r\nDTEND;TZID=America/New_York:20240311T100000'),
      { ...opts, from: Date.parse('2024-03-01T00:00:00Z'), to: Date.parse('2024-04-01T00:00:00Z') },
    );
    expect(iso(r[0].start)).toBe('2024-03-11T13:00:00.000Z');
  });

  it('treats floating times as the default tz', () => {
    const r = parseIcs(wrap('UID:c\r\nDTSTART:20241118T090000\r\nDTEND:20241118T100000'), opts);
    expect(iso(r[0].start)).toBe('2024-11-18T00:00:00.000Z');
  });

  it('parses all-day events (VALUE=DATE) in default tz', () => {
    const r = parseIcs(wrap('UID:d\r\nDTSTART;VALUE=DATE:20241120\r\nDTEND;VALUE=DATE:20241122'), opts);
    expect(r[0].allDay).toBe(true);
    expect(iso(r[0].start)).toBe('2024-11-19T15:00:00.000Z');
    expect(iso(r[0].end)).toBe('2024-11-21T15:00:00.000Z');
  });

  it('single-day all-day event without DTEND lasts one day', () => {
    const r = parseIcs(wrap('UID:d2\r\nDTSTART;VALUE=DATE:20241120'), opts);
    expect(iso(r[0].end)).toBe('2024-11-20T15:00:00.000Z');
  });

  it('unfolds long lines and unescapes text', () => {
    const r = parseIcs(wrap('UID:e\r\nSUMMARY:Hello\\, wor\r\n ld\r\nDTSTART:20241118T010000Z\r\nDTEND:20241118T020000Z'), opts);
    expect(r[0].title).toBe('Hello, world');
  });

  it('skips TRANSPARENT and CANCELLED', () => {
    const r = parseIcs(
      wrap(
        'UID:f\r\nTRANSP:TRANSPARENT\r\nDTSTART:20241118T010000Z\r\nDTEND:20241118T020000Z',
        'UID:g\r\nSTATUS:CANCELLED\r\nDTSTART:20241118T010000Z\r\nDTEND:20241118T020000Z',
        'UID:h\r\nTRANSP:OPAQUE\r\nDTSTART:20241118T030000Z\r\nDTEND:20241118T040000Z',
      ),
      opts,
    );
    expect(r.map((e) => e.uid)).toEqual(['h']);
  });

  it('ignores VALARM contents', () => {
    const r = parseIcs(
      wrap('UID:i\r\nDTSTART:20241118T010000Z\r\nDTEND:20241118T020000Z\r\nBEGIN:VALARM\r\nTRIGGER:-PT15M\r\nSUMMARY:alarm\r\nEND:VALARM'),
      opts,
    );
    expect(r[0].title).toBe('');
  });

  it('filters by range', () => {
    const r = parseIcs(wrap('UID:j\r\nDTSTART:20250118T010000Z\r\nDTEND:20250118T020000Z'), opts);
    expect(r).toEqual([]);
  });

  it('expands DAILY with COUNT', () => {
    const r = parseIcs(wrap('UID:k\r\nDTSTART:20241118T010000Z\r\nDTEND:20241118T020000Z\r\nRRULE:FREQ=DAILY;COUNT=3'), opts);
    expect(r.map((e) => iso(e.start))).toEqual([
      '2024-11-18T01:00:00.000Z',
      '2024-11-19T01:00:00.000Z',
      '2024-11-20T01:00:00.000Z',
    ]);
  });

  it('expands DAILY with INTERVAL and UNTIL', () => {
    const r = parseIcs(
      wrap('UID:l\r\nDTSTART:20241118T010000Z\r\nDTEND:20241118T020000Z\r\nRRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20241124T000000Z'),
      opts,
    );
    expect(r.map((e) => iso(e.start).slice(0, 10))).toEqual(['2024-11-18', '2024-11-20', '2024-11-22']);
  });

  it('expands WEEKLY with BYDAY and EXDATE', () => {
    const r = parseIcs(
      wrap(
        'UID:m\r\nDTSTART:20241118T010000Z\r\nDTEND:20241118T020000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6\r\nEXDATE:20241120T010000Z',
      ),
      opts,
    );
    // Mon18, Wed20(excluded), Mon25, Wed27, Mon Dec2, Wed Dec4  (COUNT=6 counts excluded one)
    expect(r.map((e) => iso(e.start).slice(0, 10))).toEqual(['2024-11-18', '2024-11-25', '2024-11-27', '2024-12-02', '2024-12-04']);
  });

  it('WEEKLY INTERVAL=2 skips alternate weeks', () => {
    const r = parseIcs(
      wrap('UID:n\r\nDTSTART:20241118T010000Z\r\nDTEND:20241118T020000Z\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3'),
      opts,
    );
    expect(r.map((e) => iso(e.start).slice(0, 10))).toEqual(['2024-11-18', '2024-12-02', '2024-12-16']);
  });

  it('keeps local time across DST for TZID recurring events', () => {
    const r = parseIcs(
      wrap(
        'UID:o\r\nDTSTART;TZID=America/New_York:20241101T090000\r\nDTEND;TZID=America/New_York:20241101T100000\r\nRRULE:FREQ=DAILY;COUNT=4',
      ),
      opts,
    );
    expect(r.map((e) => iso(e.start))).toEqual([
      '2024-11-01T13:00:00.000Z', // EDT
      '2024-11-02T13:00:00.000Z',
      '2024-11-03T14:00:00.000Z', // EST after fall back
      '2024-11-04T14:00:00.000Z',
    ]);
  });

  it('applies RECURRENCE-ID overrides', () => {
    const r = parseIcs(
      wrap(
        'UID:p\r\nDTSTART:20241118T010000Z\r\nDTEND:20241118T020000Z\r\nRRULE:FREQ=DAILY;COUNT=2',
        'UID:p\r\nRECURRENCE-ID:20241119T010000Z\r\nDTSTART:20241119T050000Z\r\nDTEND:20241119T060000Z',
      ),
      opts,
    );
    expect(r.map((e) => iso(e.start))).toEqual(['2024-11-18T01:00:00.000Z', '2024-11-19T05:00:00.000Z']);
  });

  it('expands recurring all-day events', () => {
    const r = parseIcs(wrap('UID:q\r\nDTSTART;VALUE=DATE:20241118\r\nRRULE:FREQ=WEEKLY;COUNT=2'), opts);
    expect(r).toHaveLength(2);
    expect(iso(r[1].start)).toBe('2024-11-24T15:00:00.000Z');
  });
});
