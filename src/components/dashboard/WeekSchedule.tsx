import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CalendarEvent } from '../../../shared/types';
import { api } from '../../lib/api';
import { useApp } from '../../lib/appContext';
import { item } from '../../lib/motion';
import { useAsync } from '../../lib/useAsync';
import { fmtRange, todayIn, WEEKDAYS_JA, ymdAdd, ymdDiff, ymdWeekday, zoned, zonedToUtc, type YMD } from '../../lib/time';

const START_H = 8;
const END_H = 19.5;
const LABELS = [9, 12, 15, 18];

export function weekStart(today: YMD, offset: number): YMD {
  const wd = ymdWeekday(today);
  const toMon = wd === 0 ? -6 : 1 - wd;
  return ymdAdd(today, toMon + offset * 7);
}

export function WeekSchedule() {
  const { tz } = useApp();
  const [offset, setOffset] = useState(0);
  const [dir, setDir] = useState(1);
  const today = todayIn(tz);
  const mon = weekStart(today, offset);
  const days = Array.from({ length: 7 }, (_, i) => ymdAdd(mon, i));
  const sun = days[6];
  const from = zonedToUtc(mon.y, mon.m, mon.d, 0, 0, tz).toISOString();
  const nextMon = ymdAdd(mon, 7);
  const to = zonedToUtc(nextMon.y, nextMon.m, nextMon.d, 0, 0, tz).toISOString();
  const { data, loading } = useAsync(() => api.calendarEvents(from, to), [from, to]);

  const placed = useMemo(() => {
    const out: { ev: CalendarEvent; col: number; top: number; height: number }[] = [];
    for (const ev of data ?? []) {
      if (ev.status === 'declined' || ev.status === 'cancelled') continue;
      const s = zoned(ev.start, tz);
      const col = ymdDiff({ y: s.year, m: s.month, d: s.day }, mon);
      if (col < 0 || col > 6) continue;
      const startH = s.hour + s.minute / 60;
      const durH = (new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 3600000;
      const a = Math.max(START_H, startH);
      const b = Math.min(END_H, startH + durH);
      if (b <= START_H || a >= END_H) continue;
      out.push({ ev, col, top: (a - START_H) / (END_H - START_H), height: (b - a) / (END_H - START_H) });
    }
    return out;
  }, [data, tz, mon.y, mon.m, mon.d]);

  const range =
    mon.m === sun.m ? `${mon.m}月${mon.d}日 - ${sun.d}日` : `${mon.m}月${mon.d}日 - ${sun.m}月${sun.d}日`;

  const go = (d: number) => {
    setDir(d);
    setOffset((o) => o + d);
  };

  return (
    <motion.section className="card dash-week" variants={item}>
      <div className="card__head">
        <h2 className="card__title">
          <CalendarDays size={24} strokeWidth={1.8} />
          今週のスケジュール
        </h2>
        <div className="week-nav">
          <button className="icon-btn icon-btn--sm" onClick={() => go(-1)} aria-label="前の週">
            <ChevronLeft size={20} />
          </button>
          <button className="week-nav__label" onClick={() => offset !== 0 && go(-offset)} title="今週に戻る">
            {range}
          </button>
          <button className="icon-btn icon-btn--sm" onClick={() => go(1)} aria-label="次の週">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      <div className="week">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={offset}
            className="week__inner"
            custom={dir}
            variants={{
              enter: (d: number) => ({ x: d * 40, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: d * -40, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          >
            <div className="week__head">
              <span />
              {days.map((d, i) => {
                const isToday = ymdDiff(d, today) === 0;
                return (
                  <span key={i} className={`week__day${isToday ? ' is-today' : ''}`}>
                    <b>{WEEKDAYS_JA[(i + 1) % 7]}</b>
                    <span>
                      {d.m}/{d.d}
                    </span>
                    {isToday && <motion.i layoutId="week-today" className="week__underline" />}
                  </span>
                );
              })}
            </div>
            <div className="week__body">
              <div className="week__labels">
                {LABELS.map((h) => (
                  <span key={h} style={{ top: `${((h - START_H) / (END_H - START_H)) * 100}%` }}>
                    {h}:00
                  </span>
                ))}
              </div>
              <div className="week__grid">
                {days.map((_, i) => (
                  <div key={i} className="week__col" />
                ))}
                {LABELS.map((h) => (
                  <div key={h} className="week__hline" style={{ top: `${((h - START_H) / (END_H - START_H)) * 100}%` }} />
                ))}
                {placed.map(({ ev, col, top, height }, i) => (
                  <motion.div
                    key={ev.id}
                    className={`wev ${ev.source === 'booking' ? (ev.status === 'pending' ? 'wev--pending' : 'wev--teal') : 'wev--purple'}`}
                    style={{ left: `calc(${(col / 7) * 100}% + 4px)`, top: `${top * 100}%`, minHeight: `${height * 100}%` }}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 + i * 0.04 }}
                    title={`${fmtRange(ev.start, ev.end, tz)} ${ev.title}`}
                  >
                    <span className="wev__time">{fmtRange(ev.start, ev.end, tz).replace(' – ', ' - ')}</span>
                    <span className="wev__title">{ev.title}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
        {loading && !data && <div className="week__loading"><span className="spinner" /></div>}
      </div>
    </motion.section>
  );
}
