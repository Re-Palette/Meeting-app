import { motion } from 'framer-motion';
import { CalendarDays, ChevronRight, EllipsisVertical, UsersRound, CalendarPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Booking } from '../../../shared/types';
import { useApp } from '../../lib/appContext';
import { item } from '../../lib/motion';
import { fmtDate, fmtRange, WEEKDAYS_JA, zoned } from '../../lib/time';
import { EmptyState } from '../EmptyState';
import { LocationPill } from '../LocationPill';
import { SkelRows } from '../Skeleton';

export function attendeeLine(b: Booking) {
  return [b.guestName, b.guestCompany].filter(Boolean).join(' / ');
}

export function UpcomingMeetings({ items, onOpen }: { items?: Booking[]; onOpen: (b: Booking) => void }) {
  const { tz } = useApp();
  return (
    <motion.section className="card dash-upcoming" variants={item}>
      <div className="card__head">
        <h2 className="card__title">
          <CalendarDays size={24} strokeWidth={1.8} />
          今後のミーティング
        </h2>
        <Link to="/bookings" className="card__more">
          すべて見る <ChevronRight size={18} />
        </Link>
      </div>
      {!items ? (
        <SkelRows rows={3} h={64} />
      ) : items.length === 0 ? (
        <EmptyState icon={<CalendarPlus size={26} />} title="今後のミーティングはありません" text="日程調整ページのリンクを共有して、予定を受け付けましょう。" />
      ) : (
        <ul className="meetings">
          {items.slice(0, 3).map((b, i) => {
            const z = zoned(b.start, tz);
            return (
              <motion.li
                key={b.id}
                className="meeting"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.06, type: 'spring', stiffness: 300, damping: 30 }}
                onClick={() => onOpen(b)}
              >
                <span className={`meeting__rail ${b.location === 'zoom' ? 'is-purple' : ''}`} />
                <span className="date-chip">
                  {fmtDate(b.start, tz)}
                  <br />({WEEKDAYS_JA[z.weekday]})
                </span>
                <span className="meeting__time">{fmtRange(b.start, b.end, tz)}</span>
                <span className="meeting__info">
                  <span className="meeting__title">
                    {b.eventTitle}
                    {b.status === 'pending' && <span className="badge badge--pending meeting__badge">承認待ち</span>}
                  </span>
                  <span className="meeting__who">
                    <UsersRound size={14} />
                    <span>{attendeeLine(b)}</span>
                  </span>
                </span>
                <span className="meeting__loc">
                  <LocationPill type={b.location} href={b.meetUrl || undefined} />
                </span>
                <button
                  className="icon-btn icon-btn--sm meeting__kebab"
                  aria-label="詳細"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(b);
                  }}
                >
                  <EllipsisVertical size={18} />
                </button>
              </motion.li>
            );
          })}
        </ul>
      )}
    </motion.section>
  );
}
