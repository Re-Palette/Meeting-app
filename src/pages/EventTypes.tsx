import { AnimatePresence, motion } from 'framer-motion';
import { Clock, ExternalLink, Link2, Pencil, Plus, Trash2, ArrowRight, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { EventTypeWithStats } from '../../shared/types';
import { CopyButton } from '../components/CopyButton';
import { COLOR_HEX } from '../components/dashboard/PagesTable';
import { EmptyState, ErrorState } from '../components/EmptyState';
import { LocationIcon } from '../components/LocationPill';
import { Skel } from '../components/Skeleton';
import { Sparkline } from '../components/Sparkline';
import { useToast } from '../components/Toast';
import { Toggle } from '../components/Toggle';
import { TopBar } from '../components/TopBar';
import { api } from '../lib/api';
import { publicUrl } from '../lib/clipboard';
import { item } from '../lib/motion';
import { durationLabel, LOCATION_LABEL } from '../lib/time';
import { useAsync } from '../lib/useAsync';

function toInput(et: EventTypeWithStats) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, createdAt, bookingCount, trend, ...rest } = et;
  return rest;
}

export default function EventTypes() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsync(() => api.eventTypes(), []);

  const toggle = async (et: EventTypeWithStats, active: boolean) => {
    setData((xs) => (xs ?? []).map((x) => (x.id === et.id ? { ...x, active } : x)));
    try {
      await api.updateEventType(et.id, { ...toInput(et), active });
      toast(active ? 'ページを公開しました' : 'ページを非公開にしました');
    } catch (e) {
      setData((xs) => (xs ?? []).map((x) => (x.id === et.id ? { ...x, active: !active } : x)));
      toast((e as Error).message, 'error');
    }
  };

  const remove = async (et: EventTypeWithStats) => {
    if (!window.confirm(`「${et.title}」を削除しますか？この操作は取り消せません。`)) return;
    try {
      await api.deleteEventType(et.id);
      setData((xs) => (xs ?? []).filter((x) => x.id !== et.id));
      toast('ページを削除しました');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const newBtn = (
    <button className="btn btn--primary" onClick={() => navigate('/pages/new')}>
      <Plus size={17} strokeWidth={2.5} /> 新規作成 <ArrowRight size={16} className="btn__arrow" />
    </button>
  );

  return (
    <>
      <TopBar title="日程調整ページ" subtitle="URLを共有するだけで、相手が空き時間から予約できます。" />
      <motion.div className="toolbar" variants={item}>
        <span className="toolbar__count">{data ? `${data.length}件のページ` : ''}</span>
        {newBtn}
      </motion.div>
      {error ? (
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      ) : loading && !data ? (
        <div className="et-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card et-card">
              <Skel w="60%" h={20} />
              <Skel w="40%" h={14} style={{ marginTop: 12 }} />
              <Skel h={36} style={{ marginTop: 24 }} />
            </div>
          ))}
        </div>
      ) : data && data.length === 0 ? (
        <motion.div className="card" variants={item}>
          <EmptyState
            icon={<Link2 size={26} />}
            title="日程調整ページがまだありません"
            text="面談・商談・打ち合わせなど、用途ごとにページを作成して空き時間を共有しましょう。"
            action={newBtn}
          />
        </motion.div>
      ) : (
        <motion.div className="et-grid" variants={{ enter: { transition: { staggerChildren: 0.05 } } }}>
          <AnimatePresence>
            {data?.map((et) => (
              <motion.article
                key={et.id}
                layout
                className={`card et-card${et.active ? '' : ' is-off'}`}
                variants={item}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={() => navigate(`/pages/${et.id}`)}
                style={{ ['--accent' as string]: COLOR_HEX[et.color] }}
              >
                <div className="et-card__top">
                  <span className="et-card__dot" />
                  <div className="et-card__titles">
                    <h3>{et.title}</h3>
                    <div className="et-card__meta">
                      <span>
                        <Clock size={14} /> {durationLabel(et.durationMin)}
                      </span>
                      <span>
                        <LocationIcon type={et.location} size={15} /> {LOCATION_LABEL[et.location]}
                      </span>
                      {et.requireApproval && (
                        <span>
                          <ShieldCheck size={14} /> 承認制
                        </span>
                      )}
                    </div>
                  </div>
                  <label className="et-card__toggle" onClick={(e) => e.stopPropagation()}>
                    <span className={`badge ${et.active ? 'badge--live' : 'badge--off'}`}>{et.active ? '公開中' : '非公開'}</span>
                    <Toggle checked={et.active} onChange={(v) => toggle(et, v)} label="公開" />
                  </label>
                </div>
                {et.description && <p className="et-card__desc">{et.description}</p>}
                <div className="et-card__url" onClick={(e) => e.stopPropagation()}>
                  <span className="pill-link">
                    <span className="pill-link__text">{publicUrl(et.slug)}</span>
                  </span>
                  <CopyButton text={publicUrl(et.slug)} />
                  <a className="icon-btn icon-btn--sm" href={`/s/${et.slug}`} target="_blank" rel="noreferrer" aria-label="プレビュー">
                    <ExternalLink size={17} />
                  </a>
                </div>
                <div className="et-card__foot">
                  <div className="et-card__count">
                    <b>{et.bookingCount}</b>件の予約
                  </div>
                  <div className="et-card__spark">
                    <Sparkline data={et.trend} color={COLOR_HEX[et.color]} width={100} height={30} />
                  </div>
                  <div className="et-card__actions" onClick={(e) => e.stopPropagation()}>
                    <button className="icon-btn icon-btn--sm" onClick={() => navigate(`/pages/${et.id}`)} aria-label="編集">
                      <Pencil size={16} />
                    </button>
                    <button className="icon-btn icon-btn--sm danger" onClick={() => remove(et)} aria-label="削除">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </>
  );
}
