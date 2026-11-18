import type { BusyRule } from '../shared/types';
import type { Interval } from './tz.js';

/** A calendar event with the calendar it came from (Google calendar id, or `ics:<feed url>`). */
export interface TaggedEvent {
  id?: string;
  calendarId: string;
  title: string;
  start: number; // epoch ms
  end: number;
}

export interface RuleBlock {
  rule: BusyRule;
  event: TaggedEvent;
  block: Interval;
}

/** NFKC (full-width -> half-width etc.) + case folding, for Japanese-friendly matching. */
export function normalizeText(s: string): string {
  return s.normalize('NFKC').toLowerCase();
}

export function activeRules(rules: BusyRule[] | undefined): BusyRule[] {
  return (rules ?? []).filter((r) => r.enabled && (r.calendarId || r.keyword.trim()));
}

export function ruleMatches(rule: BusyRule, ev: TaggedEvent): boolean {
  if (!rule.enabled) return false;
  const kw = normalizeText(rule.keyword.trim());
  if (!rule.calendarId && !kw) return false;
  if (rule.calendarId && rule.calendarId !== ev.calendarId) return false;
  return !kw || normalizeText(ev.title).includes(kw);
}

/** Extra fetch margin (ms) so events just outside a query window still block into it. */
export function rulePadMs(rules: BusyRule[]): number {
  return rules.reduce((m, r) => Math.max(m, r.beforeMin, r.afterMin), 0) * 60000;
}

export function expandRules(rules: BusyRule[], events: TaggedEvent[]): RuleBlock[] {
  const out: RuleBlock[] = [];
  for (const rule of rules) {
    for (const event of events) {
      if (!ruleMatches(rule, event)) continue;
      out.push({ rule, event, block: { start: event.start - rule.beforeMin * 60000, end: event.end + rule.afterMin * 60000 } });
    }
  }
  return out;
}
