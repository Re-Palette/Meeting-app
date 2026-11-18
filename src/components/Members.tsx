import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, MailPlus, Trash2, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Member } from '../../shared/types';
import { api } from '../lib/api';
import { useApp } from '../lib/appContext';
import { copyText } from '../lib/clipboard';
import { item } from '../lib/motion';
import { fmtDateTime, relativeDays } from '../lib/time';
import { Avatar } from './Avatar';
import { ErrorState } from './EmptyState';
import { Skel } from './Skeleton';
import { useToast } from './Toast';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function inviteMessage() {
  return `MeetFlowに招待しました。${window.location.origin}/login を開いて『Googleでログイン』から、招待したGoogleアカウントでログインしてください。`;
}

function MemberBadge({ m }: { m: Member }) {
  if (m.role === 'owner') return <span className="badge badge--owner">オーナー</span>;
  if (m.status === 'invited') return <span className="badge badge--pending">招待中</span>;
  return <span className="badge badge--live">利用中</span>;
}

/** Owner-only card: invite people (Google sign-in) and remove them. */
export function MembersCard() {
  const { tz } = useApp();
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>();
  const [error, setError] = useState<Error>();
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [invited, setInvited] = useState('');
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState('');

  const load = () => {
    setError(undefined);
    api.members().then(setMembers).catch(setError);
  };
  useEffect(load, []);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim().toLowerCase();
    if (!EMAIL_RE.test(v)) {
      setFormError('正しいメールアドレスを入力してください');
      return;
    }
    if (members?.some((m) => m.email.toLowerCase() === v)) {
      setFormError('このメールアドレスはすでに登録されています');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const m = await api.inviteMember(v);
      setMembers((xs) => [...(xs ?? []), m]);
      setEmail('');
      setInvited(m.email);
      setCopied(false);
      toast(`${m.email} を招待しました`);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: Member) => {
    if (!window.confirm(`${m.email} を削除しますか？\n\nこのメンバーと、その人の日程調整ページ・予約をすべて削除します。この操作は取り消せません。`)) return;
    setRemoving(m.email);
    try {
      await api.removeMember(m.email);
      setMembers((xs) => (xs ?? []).filter((x) => x.email !== m.email));
      if (invited === m.email) setInvited('');
      toast('メンバーを削除しました');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setRemoving('');
    }
  };

  const copy = async () => {
    if (await copyText(inviteMessage())) {
      setCopied(true);
      toast('招待メッセージをコピーしました');
      window.setTimeout(() => setCopied(false), 1800);
    } else toast('コピーできませんでした', 'error');
  };

  return (
    <motion.section className="card form-card members" variants={item} layout="position">
      <h2 className="form-card__title">
        <UsersRound size={20} /> メンバー
        {members && <span className="members__count">{members.length}人</span>}
      </h2>
      <p className="field__hint" style={{ marginBottom: 14, lineHeight: 1.7 }}>
        招待したGoogleアカウントでログインすると、その人専用の日程調整ページ・予約・カレンダー連携を使えます。メンバー同士のデータは共有されません。
      </p>

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !members ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skel h={56} r={14} />
          <Skel h={56} r={14} />
        </div>
      ) : (
        <motion.ul className="mlist" layout>
          <AnimatePresence initial={false}>
            {members.map((m) => (
              <motion.li
                key={m.email}
                layout
                className="mrow"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 40, height: 0, paddingTop: 0, paddingBottom: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              >
                <Avatar name={m.name || m.email} size={44} />
                <span className="mrow__main">
                  <span className={`mrow__name${m.name ? '' : ' is-empty'}`}>{m.name || '未ログイン'}</span>
                  <span className="mrow__email">{m.email || '（Google未連携）'}</span>
                </span>
                <MemberBadge m={m} />
                <span className="mrow__last" title={m.lastLoginAt ? fmtDateTime(m.lastLoginAt, tz) : undefined}>
                  <small>最終ログイン</small>
                  {m.lastLoginAt ? relativeDays(m.lastLoginAt) : '—'}
                </span>
                <span className="mrow__actions">
                  {m.role !== 'owner' && (
                    <button className="icon-btn icon-btn--sm danger" aria-label={`${m.email} を削除`} disabled={removing === m.email} onClick={() => remove(m)}>
                      {removing === m.email ? <span className="spinner spinner--sm" /> : <Trash2 size={16} />}
                    </button>
                  )}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      <form className="minvite" onSubmit={invite} noValidate>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFormError('');
          }}
          placeholder="name@gmail.com"
          aria-label="招待するメールアドレス"
          autoComplete="off"
        />
        <button className="btn btn--primary" disabled={busy || !email.trim()}>
          {busy ? <span className="spinner spinner--sm" /> : <MailPlus size={16} />} 招待する
        </button>
      </form>
      <AnimatePresence>
        {formError && (
          <motion.p className="field__error" style={{ marginTop: 8 }} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {formError}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {invited && (
          <motion.div
            className="minvite__msg"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 14 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <div className="minvite__msg-inner">
              <div className="minvite__msg-head">
                <b>{invited} に送るメッセージ</b>
                <button type="button" className="btn btn--glass btn--sm" onClick={copy}>
                  {copied ? <Check size={15} color="var(--teal-strong)" /> : <Copy size={15} />}
                  {copied ? 'コピーしました' : 'コピー'}
                </button>
              </div>
              <p>{inviteMessage()}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
