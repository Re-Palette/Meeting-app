import { motion } from 'framer-motion';
import { CalendarCheck, CircleCheck, Percent, Timer, ChartNoAxesColumn, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { AnalyticsData } from '../../shared/types';
import { EmptyState, ErrorState } from '../components/EmptyState';
import { Skel } from '../components/Skeleton';
import { TopBar } from '../components/TopBar';
import { api } from '../lib/api';
import { item } from '../lib/motion';
import { WEEKDAYS_JA } from '../lib/time';
import { useAsync } from '../lib/useAsync';

const SERIES = [
  { key: 'confirmed', label: '確定', color: '#3cc9b2' },
  { key: 'pending', label: '承認待ち', color: '#f5a86b' },
  { key: 'declined', label: '辞退', color: '#a9a6f2' },
  { key: 'cancelled', label: 'キャンセル', color: '#c3ccd5' },
] as const;

function Kpi({ icon: Icon, label, value, unit, tone }: { icon: LucideIcon; label: string; value: string; unit?: string; tone: string }) {
  return (
    <motion.div className={`card kpi stat--${tone}`} variants={item}>
      <span className={`stat__icon stat__icon--${tone}`}>
        <Icon size={22} />
      </span>
      <div>
        <div className="kpi__label">{label}</div>
        <div className="kpi__value">
          {value}
          {unit && <small>{unit}</small>}
        </div>
      </div>
    </motion.div>
  );
}

function WeeklyBars({ data }: { data: AnalyticsData['weekly'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 240;
  const pad = { l: 30, r: 8, t: 12, b: 28 };
  const totals = data.map((w) => w.confirmed + w.pending + w.declined + w.cancelled);
  const max = Math.max(4, ...totals);
  const niceMax = Math.ceil(max / 4) * 4;
  const bw = (W - pad.l - pad.r) / data.length;
  const y = (v: number) => pad.t + (1 - v / niceMax) * (H - pad.t - pad.b);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart__svg" role="img" aria-label="週ごとの予約数">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(niceMax * t)} y2={y(niceMax * t)} className="chart__grid" />
            <text x={pad.l - 8} y={y(niceMax * t) + 4} className="chart__axis" textAnchor="end">
              {niceMax * t}
            </text>
          </g>
        ))}
        {data.map((w, i) => {
          let acc = 0;
          const x = pad.l + i * bw + bw * 0.2;
          const d = new Date(w.weekStart);
          return (
            <g key={w.weekStart} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              {SERIES.map((s) => {
                const v = w[s.key];
                if (!v) return null;
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                return (
                  <motion.rect
                    key={s.key}
                    x={x}
                    width={bw * 0.6}
                    rx={4}
                    fill={s.color}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                    initial={{ y: y(0), height: 0 }}
                    animate={{ y: y1, height: Math.max(0, y0 - y1 - 1.5) }}
                    transition={{ type: 'spring', stiffness: 200, damping: 26, delay: i * 0.03 }}
                  />
                );
              })}
              <text x={x + bw * 0.3} y={H - 8} className="chart__axis" textAnchor="middle">
                {d.getMonth() + 1}/{d.getDate()}
              </text>
              {hover === i && (
                <g>
                  <rect x={Math.min(x - 30, W - 120)} y={Math.max(4, y(totals[i]) - 40)} width={110} height={30} rx={8} className="chart__tip" />
                  <text x={Math.min(x - 30, W - 120) + 55} y={Math.max(4, y(totals[i]) - 40) + 20} textAnchor="middle" className="chart__tiptext">
                    合計 {totals[i]}件（確定 {w.confirmed}）
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {SERIES.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ByPage({ data }: { data: AnalyticsData['byEventType'] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  if (data.length === 0) return <EmptyState icon={<ChartNoAxesColumn size={24} />} title="データがありません" />;
  return (
    <ul className="hbars">
      {data.map((d, i) => (
        <li key={d.eventTypeId}>
          <span className="hbars__label">{d.title}</span>
          <span className="hbars__track">
            <motion.span
              className="hbars__bar"
              initial={{ width: 0 }}
              animate={{ width: `${(d.count / max) * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.1 + i * 0.06 }}
            />
          </span>
          <span className="hbars__val">{d.count}件</span>
        </li>
      ))}
    </ul>
  );
}

function Heat({ values, labels, titles, color }: { values: number[]; labels: string[]; titles?: string[]; color: [number, number, number] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="heat" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
      {values.map((v, i) => (
        <div key={i} className="heat__cell" title={`${titles?.[i] ?? labels[i]}: ${v}件`}>
          <motion.span
            className="heat__swatch"
            style={{ background: `rgba(${color.join(',')}, ${0.08 + (v / max) * 0.85})` }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.015 }}
          >
            {values.length <= 7 ? v : ''}
          </motion.span>
          <span className="heat__label">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const { data, error, loading, reload } = useAsync(() => api.analytics(), [], 'analytics');
  const t = data?.totals;
  // Mon-first order for weekday strip
  const wdOrder = [1, 2, 3, 4, 5, 6, 0];
  return (
    <>
      <TopBar title="分析" subtitle="過去12週間の予約の傾向を確認できます。" />
      {error ? (
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      ) : (
        <div className="analytics">
          <div className="kpis">
            {t ? (
              <>
                <Kpi icon={CalendarCheck} label="総予約数" value={String(t.bookings)} unit="件" tone="teal" />
                <Kpi icon={CircleCheck} label="確定数" value={String(t.confirmed)} unit="件" tone="green" />
                <Kpi icon={Percent} label="承認率" value={`${Math.round(t.approvalRate)}`} unit="%" tone="orange" />
                <Kpi icon={Timer} label="平均リードタイム" value={t.avgLeadDays.toFixed(1)} unit="日" tone="purple" />
              </>
            ) : (
              [0, 1, 2, 3].map((i) => (
                <div className="card kpi" key={i}>
                  <Skel w={44} h={44} r={22} />
                  <div style={{ flex: 1 }}>
                    <Skel w="50%" h={12} />
                    <Skel w="40%" h={26} style={{ marginTop: 8 }} />
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="analytics__row">
            <motion.section className="card" variants={item}>
              <div className="card__head">
                <h2 className="card__title">週ごとの予約数</h2>
              </div>
              {loading && !data ? <Skel h={240} /> : data && <WeeklyBars data={data.weekly} />}
            </motion.section>
            <motion.section className="card" variants={item}>
              <div className="card__head">
                <h2 className="card__title">ページ別の予約数</h2>
              </div>
              {loading && !data ? <Skel h={200} /> : data && <ByPage data={data.byEventType} />}
            </motion.section>
          </div>
          <div className="analytics__row analytics__row--even">
            <motion.section className="card" variants={item}>
              <div className="card__head">
                <h2 className="card__title">曜日別</h2>
              </div>
              {data ? (
                <Heat values={wdOrder.map((d) => data.byWeekday[d] ?? 0)} labels={wdOrder.map((d) => WEEKDAYS_JA[d])} color={[47, 191, 171]} />
              ) : (
                <Skel h={70} />
              )}
            </motion.section>
            <motion.section className="card" variants={item}>
              <div className="card__head">
                <h2 className="card__title">時間帯別</h2>
              </div>
              {data ? (
                <Heat
                  values={data.byHour}
                  labels={data.byHour.map((_, i) => (i % 3 === 0 ? `${i}` : ''))}
                  titles={data.byHour.map((_, i) => `${i}時台`)}
                  color={[110, 107, 230]}
                />
              ) : (
                <Skel h={70} />
              )}
            </motion.section>
          </div>
        </div>
      )}
    </>
  );
}
