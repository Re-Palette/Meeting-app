import { motion } from 'framer-motion';
import { ChevronRight, Mail, Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Booking } from '../../../shared/types';
import { useApp } from '../../lib/appContext';
import { item } from '../../lib/motion';
import { durationLabel, fmtDateTime } from '../../lib/time';
import { Avatar } from '../Avatar';
import { EmptyState } from '../EmptyState';
import { SkelRows } from '../Skeleton';

export function Requests({ items, onOpen }: { items?: Booking[]; onOpen: (b: Booking) => void }) {
  const { tz } = useApp();
  return (
    <motion.section className="card dash-req" variants={item}>
      <div className="card__head">
        <h2 className="card__title">
          <Mail size={24} strokeWidth={1.8} />
          対応が必要なリクエスト
        </h2>
        <Link to="/bookings?tab=pending" className="card__more">
          すべて見る <ChevronRight size={18} />
        </Link>
      </div>
      {!items ? (
        <SkelRows rows={2} h={56} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Inbox size={26} />} title="対応が必要なリクエストはありません" text="承認制のページに届いた予約リクエストがここに表示されます。" />
      ) : (
        <ul className="reqs">
          {items.slice(0, 2).map((b) => (
            <li key={b.id} className="req">
              <Avatar name={b.guestName} person size={54} />
              <span className="req__main">
                <span className="req__name">{b.guestName}</span>
                <span className="req__page">
                  {b.eventTitle} / {durationLabel(b.durationMin)}
                </span>
              </span>
              <span className="req__date">
                <small>申請日</small>
                {fmtDateTime(b.createdAt, tz)}
              </span>
              <button className="btn btn--glass btn--sm req__btn" onClick={() => onOpen(b)}>
                確認する <ChevronRight size={16} className="btn__arrow" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
