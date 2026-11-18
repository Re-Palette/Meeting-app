import { AnimatePresence, motion } from 'framer-motion';
import { CalendarOff, CircleAlert, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { BusyRule } from '../../shared/types';
import type { GoogleCalendar } from '../lib/api';
import { Segmented } from './Segmented';
import { Toggle } from './Toggle';

const PRESETS = [0, 15, 30, 60, 90, 120];
export const RULE_MAX_MIN = 720;

export function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}分`;
  return m ? `${h}時間${m}分` : `${h}時間`;
}

/** Mirrors the backend rule: at least one of calendarId / keyword must be set. */
export function ruleError(r: BusyRule): string {
  if (!r.calendarId && !r.keyword.trim()) return 'カレンダーかキーワードのどちらかを指定してください';
  if (r.beforeMin < 0 || r.afterMin < 0 || r.beforeMin > RULE_MAX_MIN || r.afterMin > RULE_MAX_MIN) return '時間は0〜720分で指定してください';
  return '';
}

export function newRule(): BusyRule {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, label: '', calendarId: '', keyword: '', beforeMin: 0, afterMin: 90, enabled: true };
}

export interface CalOption {
  value: string;
  label: string;
}

export function calendarOptions(cals: GoogleCalendar[] | undefined, icsUrls: string[]): CalOption[] {
  const out: CalOption[] = [{ value: '', label: 'すべてのカレンダー' }];
  for (const c of cals ?? []) out.push({ value: c.primary ? 'primary' : c.id, label: c.primary ? `${c.summary}（メイン）` : c.summary });
  for (const u of icsUrls) {
    let host = u;
    try {
      host = new URL(u).hostname;
    } catch {
      /* keep raw */
    }
    out.push({ value: `ics:${u}`, label: `ICS: ${host}` });
  }
  return out;
}

function summary(r: BusyRule, opts: CalOption[]) {
  const cal = r.calendarId ? opts.find((o) => o.value === r.calendarId)?.label.replace(/^ICS: /, '') ?? r.calendarId : '';
  const kw = r.keyword.trim();
  let target: string;
  if (cal && kw) target = `「${cal}」の「${kw}」を含む予定`;
  else if (kw) target = `「${kw}」を含む予定`;
  else if (cal) target = `「${cal}」の予定`;
  else return '対象の予定を指定してください';
  const parts: string[] = [];
  if (r.beforeMin) parts.push(`前 ${fmtDuration(r.beforeMin)}`);
  if (r.afterMin) parts.push(`後 ${fmtDuration(r.afterMin)}`);
  if (!parts.length) return `${target}：ブロックする時間が 0分 です`;
  return `${target}の ${parts.join('・')} をブロック`;
}

function DurationPicker({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [custom, setCustom] = useState(!PRESETS.includes(value));
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="row-wrap">
        <Segmented
          ariaLabel={label}
          value={custom ? 'custom' : String(value)}
          onChange={(v) => {
            if (v === 'custom') setCustom(true);
            else {
              setCustom(false);
              onChange(Number(v));
            }
          }}
          options={[...PRESETS.map((p) => ({ value: String(p), label: p === 0 ? 'なし' : `${p}分` })), { value: 'custom', label: 'カスタム' }]}
        />
        <AnimatePresence initial={false}>
          {custom && (
            <motion.div
              className="input-group input-group--num"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 120 }}
              exit={{ opacity: 0, width: 0 }}
            >
              <input
                className="input"
                type="number"
                min={0}
                max={RULE_MAX_MIN}
                step={5}
                value={value}
                aria-label={`${label}（分）`}
                onChange={(e) => onChange(Math.max(0, Math.min(RULE_MAX_MIN, Math.round(Number(e.target.value) || 0))))}
              />
              <span className="input-group__addon" style={{ paddingRight: 12 }}>
                分
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface Props {
  rules: BusyRule[];
  onChange: (rules: BusyRule[]) => void;
  options: CalOption[];
  showErrors: boolean;
}

export function BusyRulesEditor({ rules, onChange, options, showErrors }: Props) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const patch = (id: string, p: Partial<BusyRule>) => onChange(rules.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const touch = (id: string) => setTouched((t) => (t[id] ? t : { ...t, [id]: true }));

  return (
    <>
      <motion.ul className="rules" layout>
        <AnimatePresence initial={false}>
          {rules.length === 0 && (
            <motion.li key="empty" className="rules__empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CalendarOff size={20} /> ルールはまだありません
            </motion.li>
          )}
          {rules.map((r) => {
            const err = ruleError(r);
            const opts = options.some((o) => o.value === r.calendarId) ? options : [...options, { value: r.calendarId, label: r.calendarId }];
            return (
              <motion.li
                key={r.id}
                layout
                className={`rule${r.enabled ? '' : ' is-off'}${err && (showErrors || touched[r.id]) ? ' has-error' : ''}`}
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              >
                <div className="rule__head">
                  <Toggle checked={r.enabled} onChange={(v) => patch(r.id, { enabled: v })} label="ルールを有効にする" />
                  <input
                    className="input rule__label"
                    value={r.label}
                    placeholder="ルール名（例：学校のあと）"
                    aria-label="ルール名"
                    onChange={(e) => patch(r.id, { label: e.target.value })}
                  />
                  <button type="button" className="icon-btn icon-btn--sm danger" aria-label="ルールを削除" onClick={() => onChange(rules.filter((x) => x.id !== r.id))}>
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span className="field__label">対象カレンダー</span>
                    <select
                      className="select"
                      value={r.calendarId}
                      onChange={(e) => {
                        touch(r.id);
                        patch(r.id, { calendarId: e.target.value });
                      }}
                    >
                      {opts.map((o) => (
                        <option key={o.value || 'all'} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">予定名に含むキーワード</span>
                    <input
                      className="input"
                      value={r.keyword}
                      placeholder="例：学校"
                      onBlur={() => touch(r.id)}
                      onChange={(e) => patch(r.id, { keyword: e.target.value })}
                    />
                  </label>
                </div>
                <div className="rule__durations">
                  <DurationPicker label="予定の前" value={r.beforeMin} onChange={(v) => patch(r.id, { beforeMin: v })} />
                  <DurationPicker label="予定の後" value={r.afterMin} onChange={(v) => patch(r.id, { afterMin: v })} />
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  {err && (showErrors || touched[r.id]) ? (
                    <motion.p key="err" className="field__error rule__msg" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <CircleAlert size={14} /> {err}
                    </motion.p>
                  ) : (
                    <motion.p key={summary(r, opts)} className="rule__summary rule__msg" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      {summary(r, opts)}
                      {!r.enabled && <span className="badge badge--off">停止中</span>}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </motion.ul>
      <motion.button layout type="button" className="btn btn--glass btn--sm" onClick={() => onChange([...rules, newRule()])}>
        <Plus size={15} /> ルールを追加
      </motion.button>
    </>
  );
}
