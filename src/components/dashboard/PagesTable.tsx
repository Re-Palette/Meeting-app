import { motion } from 'framer-motion';
import { ChevronRight, Link2, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { EventTypeWithStats } from '../../../shared/types';
import { publicUrl } from '../../lib/clipboard';
import { item } from '../../lib/motion';
import { durationLabel } from '../../lib/time';
import { CopyButton } from '../CopyButton';
import { EmptyState } from '../EmptyState';
import { SkelRows } from '../Skeleton';
import { Sparkline } from '../Sparkline';

export const COLOR_HEX: Record<EventTypeWithStats['color'], string> = {
  teal: '#2fbfab',
  blue: '#3f8cf0',
  purple: '#7a6cf0',
  orange: '#f08a3c',
  pink: '#e8689a',
};

export function PagesTable({ items }: { items?: EventTypeWithStats[] }) {
  const navigate = useNavigate();
  return (
    <motion.section className="card dash-pages" variants={item}>
      <div className="card__head">
        <h2 className="card__title">
          <Link2 size={24} strokeWidth={2} color="#3f8cf0" />
          日程調整ページ
        </h2>
        <Link to="/pages" className="card__more">
          すべて見る <ChevronRight size={18} />
        </Link>
      </div>
      {!items ? (
        <SkelRows rows={3} h={40} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Link2 size={26} />}
          title="日程調整ページがまだありません"
          text="最初のページを作成して、URLを共有するだけで日程調整が完了します。"
          action={
            <button className="btn btn--primary btn--sm" onClick={() => navigate('/pages/new')}>
              <Plus size={16} /> 新規作成
            </button>
          }
        />
      ) : (
        <ul className="ptable">
          {items.slice(0, 3).map((et) => (
            <li key={et.id} className="ptable__row" onClick={() => navigate(`/pages/${et.id}`)}>
              <span className="ptable__title" title={`${et.title} / ${durationLabel(et.durationMin)}`}>
                {et.title} / {durationLabel(et.durationMin)}
              </span>
              <span className={`badge ${et.active ? 'badge--live' : 'badge--off'}`}>{et.active ? '公開中' : '非公開'}</span>
              <span className="ptable__url" onClick={(e) => e.stopPropagation()}>
                <span className="pill-link" title={publicUrl(et.slug)}>
                  <span className="pill-link__text">{publicUrl(et.slug)}</span>
                </span>
                <CopyButton text={publicUrl(et.slug)} />
              </span>
              <span className="ptable__count">{et.bookingCount}件</span>
              <span className="ptable__spark">
                <Sparkline data={et.trend} color={COLOR_HEX[et.color]} width={50} height={22} area={false} strokeWidth={2} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
