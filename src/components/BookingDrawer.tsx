import { CalendarClock, Mail, Building2, Video, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import type { Booking } from '../../shared/types';
import { api } from '../lib/api';
import { useApp } from '../lib/appContext';
import { fmtDateWd, fmtRange, fmtDateTime, LOCATION_LABEL, durationLabel } from '../lib/time';
import { Avatar } from './Avatar';
import { Drawer } from './Drawer';
import { LocationIcon } from './LocationPill';
import { useToast } from './Toast';

const STATUS_LABEL: Record<Booking['status'], string> = {
  pending: '承認待ち',
  confirmed: '確定',
  declined: '辞退',
  cancelled: 'キャンセル',
};

export function StatusBadge({ status }: { status: Booking['status'] }) {
  return <span className={`badge badge--${status}`}>{STATUS_LABEL[status]}</span>;
}

interface Props {
  booking: Booking | null;
  onClose: () => void;
  onChanged: (b: Booking) => void;
}

export function BookingDrawer({ booking, onClose, onChanged }: Props) {
  const { tz, refreshPending } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState<string>('');

  const act = async (kind: 'approve' | 'decline' | 'cancel') => {
    if (!booking) return;
    if (kind === 'cancel' && !window.confirm('この予定をキャンセルしますか？')) return;
    setBusy(kind);
    try {
      const fn = kind === 'approve' ? api.approveBooking : kind === 'decline' ? api.declineBooking : api.cancelBooking;
      const b = await fn(booking.id);
      onChanged(b);
      refreshPending();
      toast(kind === 'approve' ? '予定を承認しました' : kind === 'decline' ? 'リクエストを辞退しました' : '予定をキャンセルしました');
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const b = booking;
  const isUpcoming = b ? new Date(b.end).getTime() > Date.now() : false;

  return (
    <Drawer
      open={!!b}
      onClose={onClose}
      title="予定の詳細"
      footer={
        b && b.status === 'pending' ? (
          <>
            <button className="btn btn--danger" disabled={!!busy} onClick={() => act('decline')}>
              {busy === 'decline' ? <span className="spinner spinner--sm" /> : null}辞退する
            </button>
            <button className="btn btn--primary" disabled={!!busy} onClick={() => act('approve')}>
              {busy === 'approve' ? <span className="spinner spinner--sm" /> : null}承認する
            </button>
          </>
        ) : b && b.status === 'confirmed' && isUpcoming ? (
          <button className="btn btn--danger" disabled={!!busy} onClick={() => act('cancel')}>
            予定をキャンセル
          </button>
        ) : undefined
      }
    >
      {b && (
        <div className="bdetail">
          <div className="bdetail__guest">
            <Avatar name={b.guestName} size={56} />
            <div style={{ minWidth: 0 }}>
              <div className="bdetail__name">{b.guestName}</div>
              <div className="bdetail__sub">
                {b.eventTitle} / {durationLabel(b.durationMin)}
              </div>
            </div>
            <StatusBadge status={b.status} />
          </div>
          <div className="bdetail__when">
            <CalendarClock size={20} />
            <div>
              <div className="bdetail__date">{fmtDateWd(b.start, tz, '（）')}</div>
              <div className="bdetail__time">{fmtRange(b.start, b.end, tz)}</div>
            </div>
          </div>
          <dl className="dl">
            <dt>
              <Mail size={14} /> メール
            </dt>
            <dd>
              <a href={`mailto:${b.guestEmail}`} className="link">
                {b.guestEmail}
              </a>
            </dd>
            {b.guestCompany && (
              <>
                <dt>
                  <Building2 size={14} /> 会社名
                </dt>
                <dd>{b.guestCompany}</dd>
              </>
            )}
            <dt>
              <Video size={14} /> 場所
            </dt>
            <dd style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <LocationIcon type={b.location} size={16} />
              {LOCATION_LABEL[b.location]}
              {b.locationDetail && <span className="muted"> · {b.locationDetail}</span>}
            </dd>
            {b.meetUrl && (
              <>
                <dt>参加リンク</dt>
                <dd>
                  <a href={b.meetUrl} target="_blank" rel="noreferrer" className="link">
                    {b.meetUrl.replace(/^https?:\/\//, '')} <ExternalLink size={12} />
                  </a>
                </dd>
              </>
            )}
            <dt>申請日</dt>
            <dd>{fmtDateTime(b.createdAt, tz)}</dd>
            {b.notes && (
              <>
                <dt>メモ</dt>
                <dd style={{ whiteSpace: 'pre-wrap' }}>{b.notes}</dd>
              </>
            )}
            {Object.entries(b.answers || {}).map(([k, v]) => (
              <FragmentRow key={k} label={k} value={v} />
            ))}
          </dl>
        </div>
      )}
    </Drawer>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt title={label}>回答</dt>
      <dd>{value || '—'}</dd>
    </>
  );
}
