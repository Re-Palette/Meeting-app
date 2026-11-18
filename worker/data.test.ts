import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../shared/types';
import { CAL_UNAVAILABLE, getBusy, icsEvents, resetIcsCache } from './data';
import type { Env } from './env';

const settings = (icsUrls: string[]): Settings => ({
  ownerName: '',
  timezone: 'Asia/Tokyo',
  googleConnected: false,
  googleEmail: '',
  googleCalendarIds: ['primary'],
  googleTargetCalendarId: 'primary',
  icsUrls,
});

const fakeEnv = (): Env => {
  const stmt = { bind: () => stmt, first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) };
  return { DB: { prepare: () => stmt } } as unknown as Env;
};

const ICS = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTART:20241118T010000Z\r\nDTEND:20241118T020000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
const from = Date.parse('2024-11-18T00:00:00Z');
const to = Date.parse('2024-11-19T00:00:00Z');

describe('ICS fetching and busy aggregation', () => {
  beforeEach(() => resetIcsCache());
  afterEach(() => vi.unstubAllGlobals());

  it('caches the parsed feed per URL (one fetch for repeated queries)', async () => {
    const f = vi.fn(async () => new Response(ICS));
    vi.stubGlobal('fetch', f);
    const s = settings(['http://x/a.ics']);
    expect(await icsEvents(s, from, to)).toHaveLength(1);
    expect(await icsEvents(s, from, to)).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('non-strict mode degrades to no events; strict throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })));
    const s = settings(['http://x/a.ics']);
    expect(await icsEvents(s, from, to)).toEqual([]);
    await expect(icsEvents(s, from, to, true)).rejects.toThrow();
  });

  it('getBusy strict fails closed with 503 when a feed is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('unreachable'); }));
    const s = settings(['http://x/a.ics']);
    await expect(getBusy(fakeEnv(), s, from, to, { strict: true })).rejects.toMatchObject({ status: 503, message: CAL_UNAVAILABLE });
    expect(await getBusy(fakeEnv(), s, from, to)).toEqual([]);
  });

  it('getBusy returns ICS busy time when healthy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(ICS)));
    const busy = await getBusy(fakeEnv(), settings(['http://x/a.ics']), from, to, { strict: true });
    expect(busy).toEqual([{ start: Date.parse('2024-11-18T01:00:00Z'), end: Date.parse('2024-11-18T02:00:00Z') }]);
  });
});
