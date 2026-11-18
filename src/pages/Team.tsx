import { motion } from 'framer-motion';
import { Building2, CalendarCheck2, Mail, Search, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { EmptyState, ErrorState } from '../components/EmptyState';
import { Skel } from '../components/Skeleton';
import { TopBar } from '../components/TopBar';
import { api } from '../lib/api';
import { useApp } from '../lib/appContext';
import { item } from '../lib/motion';
import { fmtDate, relativeDays } from '../lib/time';
import { useAsync } from '../lib/useAsync';

export default function Team() {
  const { tz } = useApp();
  const { data, error, loading, reload } = useAsync(() => api.contacts(), []);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((c) => !s || [c.name, c.email, c.company].join(' ').toLowerCase().includes(s));
  }, [data, q]);

  return (
    <>
      <TopBar title="チーム" subtitle="これまでに日程調整したお相手（連絡先）の一覧です。" />
      <motion.div className="toolbar" variants={item}>
        <span className="toolbar__count">{data ? `${data.length}件の連絡先` : ''}</span>
        <label className="search search--inline">
          <Search size={17} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・会社・メールで検索" />
        </label>
      </motion.div>
      {error ? (
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      ) : loading && !data ? (
        <div className="contact-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="card contact" key={i}>
              <Skel w={56} h={56} r={28} />
              <Skel w="60%" h={16} style={{ marginTop: 14 }} />
              <Skel w="40%" h={12} style={{ marginTop: 8 }} />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <motion.div className="card" variants={item}>
          <EmptyState icon={<UsersRound size={26} />} title={q ? '該当する連絡先はありません' : 'まだ連絡先はありません'} text="予約を受け付けると、お相手が自動的にここへ追加されます。" />
        </motion.div>
      ) : (
        <motion.div className="contact-grid" variants={{ enter: { transition: { staggerChildren: 0.04 } } }}>
          {list.map((c) => (
            <motion.article key={c.email} className="card contact" variants={item} whileHover={{ y: -4 }}>
              <div className="contact__top">
                <Avatar name={c.name} size={56} />
                <div className="contact__names">
                  <h3>{c.name}</h3>
                  {c.company && (
                    <span>
                      <Building2 size={13} /> {c.company}
                    </span>
                  )}
                </div>
              </div>
              <a href={`mailto:${c.email}`} className="contact__mail">
                <Mail size={14} /> {c.email}
              </a>
              <div className="contact__stats">
                <div>
                  <small>ミーティング</small>
                  <b>{c.bookingCount}回</b>
                </div>
                <div>
                  <small>最終ミーティング</small>
                  <b>
                    <CalendarCheck2 size={14} /> {fmtDate(c.lastBookingAt, tz)}
                    <em>（{relativeDays(c.lastBookingAt)}）</em>
                  </b>
                </div>
              </div>
            </motion.article>
          ))}
        </motion.div>
      )}
    </>
  );
}
