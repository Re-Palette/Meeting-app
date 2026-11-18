import { AnimatePresence, motion } from 'framer-motion';
import { CalendarCheck, Check, Search, UsersRound, X, Ban } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Booking } from '../../shared/types';
import { BookingDrawer, StatusBadge } from '../components/BookingDrawer';
import { attendeeLine } from '../components/dashboard/UpcomingMeetings';
import { EmptyState, ErrorState } from '../components/EmptyState';
import { LocationPill } from '../components/LocationPill';
import { Segmented } from '../components/Segmented';
import { SkelRows } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { TopBar } from '../components/TopBar';
import { api } from '../lib/api';
import { useApp } from '../lib/appContext';
import { item } from '../lib/motion';
import { fmtDate, fmtRange, WEEKDAYS_JA, zoned } from '../lib/time';
import { useAsync } from '../lib/useAsync';

type Tab = 'upcoming' | 'pending' | 'past' | 'cancelled';
const TABS: Tab[] = ['upcoming', 'pending', 'past', 'cancelled'];

async function load(tab: Tab): Promise<Booking[]> {
  switch (tab) {
    case 'upcoming':
      return api.bookings({ status: 'confirmed', scope: 'upcoming' });
    case 'pending':
      return api.bookings({ status: 'pending', scope: 'all' });
    case 'past':
      return (await api.bookings({ status: 'confirmed', scope: 'past' })).reverse();
    case 'cancelled': {
      const [c, d] = await Promise.all([api.bookings({ status: 'cancelled', scope: 'all' }), api.bookings({ status: 'declined', scope: 'all' })]);
      return [...c, ...d].sort((a, b) => b.start.localeCompare(a.start));
    }
  }
}

const EMPTY: Record<Tab, string> = {
  upcoming: '今後の予定はありません',
  pending: '承認待ちのリクエストはありません',
  past: '過去の予定はまだありません',
  cancelled: 'キャンセルされた予定はありません',
};

export default function Bookings() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'upcoming';
  const [q, setQ] = useState(params.get('q') ?? '');
  const { tz, pendingCount, refreshPending } = useApp();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => load(tab), [tab]);
  const [open, setOpen] = useState<Booking | null>(null);
  const [busy, setBusy] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !data) return data;
    return data.filter((b) => [b.guestName, b.guestEmail, b.guestCompany, b.eventTitle, b.notes].join(' ').toLowerCase().includes(s));
  }, [data, q]);

  const setTab = (t: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', t);
    setParams(p, { replace: true });
  };

  const act = async (b: Booking, kind: 'approve' | 'decline' | 'cancel') => {
    if (kind === 'cancel' && !window.confirm('この予定をキャンセルしますか？')) return;
    setBusy(b.id + kind);
    try {
      const fn = kind === 'approve' ? api.approveBooking : kind === 'decline' ? api.declineBooking : api.cancelBooking;
      await fn(b.id);
      setData((xs) => (xs ?? []).filter((x) => x.id !== b.id));
      refreshPending();
      toast(kind === 'approve' ? '予定を承認しました' : kind === 'decline' ? 'リクエストを辞退しました' : '予定をキャンセルしました');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <TopBar title="予定一覧" subtitle="受け付けた予定とリクエストを管理します。" />
      <motion.div className="toolbar" variants={item}>
        <Segmented
          ariaLabel="予定の種類"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'upcoming', label: '今後' },
            { value: 'pending', label: '承認待ち', count: pendingCount },
            { value: 'past', label: '過去' },
            { value: 'cancelled', label: 'キャンセル' },
          ]}
        />
        <label className="search search--inline">
          <Search size={17} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・会社・ページで絞り込み" />
        </label>
      </motion.div>

      <motion.section className="card blist" variants={item}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            {error ? (
              <ErrorState error={error} onRetry={reload} />
            ) : loading && !data ? (
              <SkelRows rows={4} h={70} />
            ) : !filtered || filtered.length === 0 ? (
              <EmptyState icon={<CalendarCheck size={26} />} title={q ? '該当する予定はありません' : EMPTY[tab]} />
            ) : (
              <ul className="blist__list">
                <AnimatePresence initial={false}>
                  {filtered.map((b, i) => {
                    const z = zoned(b.start, tz);
                    const upcoming = new Date(b.end).getTime() > Date.now();
                    return (
                      <motion.li
                        key={b.id}
                        layout
                        className="brow"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * 0.03 } }}
                        exit={{ opacity: 0, x: 40, height: 0, paddingTop: 0, paddingBottom: 0 }}
                        onClick={() => setOpen(b)}
                      >
                        <span className="date-chip">
                          {fmtDate(b.start, tz)}
                          <br />({WEEKDAYS_JA[z.weekday]})
                        </span>
                        <span className="brow__main">
                          <span className="brow__time">{fmtRange(b.start, b.end, tz)}</span>
                          <span className="brow__title">{b.eventTitle}</span>
                          <span className="meeting__who">
                            <UsersRound size={14} />
                            <span>{attendeeLine(b)}</span>
                          </span>
                        </span>
                        <span className="brow__status">
                          <StatusBadge status={b.status} />
                        </span>
                        <span className="brow__loc">
                          <LocationPill type={b.location} href={b.meetUrl || undefined} />
                        </span>
                        <span className="brow__actions" onClick={(e) => e.stopPropagation()}>
                          {b.status === 'pending' && (
                            <>
                              <button className="btn btn--danger btn--sm" disabled={!!busy} onClick={() => act(b, 'decline')}>
                                <X size={15} /> 辞退
                              </button>
                              <button className="btn btn--primary btn--sm" disabled={!!busy} onClick={() => act(b, 'approve')}>
                                <Check size={15} /> 承認
                              </button>
                            </>
                          )}
                          {b.status === 'confirmed' && upcoming && (
                            <button className="btn btn--glass btn--sm" disabled={!!busy} onClick={() => act(b, 'cancel')}>
                              <Ban size={14} /> キャンセル
                            </button>
                          )}
                        </span>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.section>
      <BookingDrawer booking={open} onClose={() => setOpen(null)} onChanged={() => reload()} />
    </>
  );
}
