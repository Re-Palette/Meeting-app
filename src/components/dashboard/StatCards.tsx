import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, CalendarDays, Check, Clock, Hourglass, type LucideIcon } from 'lucide-react';
import type { DashboardData, StatCard as Stat } from '../../../shared/types';
import { item } from '../../lib/motion';
import { Skel } from '../Skeleton';
import { Sparkline } from '../Sparkline';

interface Def {
  key: keyof DashboardData['stats'];
  label: string;
  icon: LucideIcon;
  tone: 'teal' | 'green' | 'orange' | 'purple';
  color: string;
  unit?: string;
  abs?: boolean;
}

const DEFS: Def[] = [
  { key: 'monthBookings', label: '今月の予定', icon: CalendarDays, tone: 'teal', color: '#2fbfab' },
  { key: 'confirmed', label: '日程調整完了', icon: Check, tone: 'green', color: '#34c08a' },
  { key: 'pending', label: '返答待ち', icon: Hourglass, tone: 'orange', color: '#f0a060' },
  { key: 'freeHoursThisWeek', label: '今週の空き時間', icon: Clock, tone: 'purple', color: '#8a86f0', unit: 'h', abs: true },
];

function Delta({ s, abs }: { s: Stat; abs?: boolean }) {
  const up = s.delta >= 0;
  const txt = abs ? `${up ? '+' : ''}${s.delta.toFixed(1)}h` : `${up ? '+' : ''}${Math.round(s.delta)}%`;
  return (
    <span className={`stat__delta ${up ? 'is-up' : 'is-down'}`}>
      {up ? <ArrowUp size={15} strokeWidth={2.4} /> : <ArrowDown size={15} strokeWidth={2.4} />}
      {txt}
    </span>
  );
}

export function StatCards({ stats }: { stats?: DashboardData['stats'] }) {
  return (
    <div className="stats">
      {DEFS.map((d) => {
        const s = stats?.[d.key];
        const Icon = d.icon;
        return (
          <motion.div key={d.key} className={`card stat stat--${d.tone}`} variants={item}>
            <div className="stat__head">
              <span className={`stat__icon stat__icon--${d.tone}`}>
                <Icon size={24} strokeWidth={d.tone === 'green' ? 3 : 2} />
              </span>
              <span className="stat__label">{d.label}</span>
            </div>
            <div className="stat__body">
              {s ? (
                <>
                  <span className="stat__value">
                    {d.abs ? s.value.toFixed(1) : s.value}
                    {d.unit && <small> {d.unit}</small>}
                  </span>
                  <Delta s={s} abs={d.abs} />
                </>
              ) : (
                <Skel w={110} h={44} r={10} />
              )}
            </div>
            {s && (
              <div className="stat__spark">
                <Sparkline data={s.series} color={d.color} width={180} height={64} />
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
