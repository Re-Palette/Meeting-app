import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Clock, Globe2, Hourglass, ShieldCheck, Video, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Booking, PublicEventType, Slot } from '../../shared/types';
import { COLOR_HEX } from '../components/dashboard/PagesTable';
import { LocationIcon } from '../components/LocationPill';
import { LogoMark } from '../components/Logo';
import { Skel } from '../components/Skeleton';
import { api, HttpError } from '../lib/api';
import { browserTz, daysInMonth, durationLabel, fmtDateWd, fmtRange, fmtTime, LOCATION_LABEL, todayIn, tzLabel, WEEKDAYS_JA, ymdAdd, ymdKey, zoned, type YMD } from '../lib/time';
import NotFound from './NotFound';

type Step = 'pick' | 'form' | 'done';
const STEP_INDEX: Record<Step, number> = { pick: 0, form: 1, done: 2 };

const slide = {
  enter: (d: number) => ({ x: d * 60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d * -60, opacity: 0 }),
};
const slideT = { type: 'spring', stiffness: 320, damping: 34 } as const;

export default function PublicBooking() {
  const { slug = '' } = useParams();
  const tz = useMemo(browserTz, []);
  const today = useMemo(() => todayIn(tz), [tz]);
  const [et, setEt] = useState<PublicEventType>();
  const [etError, setEtError] = useState<HttpError | Error>();
  const [month, setMonth] = useState<{ y: number; m: number }>({ y: today.y, m: today.m });
  const [monthDir, setMonthDir] = useState(1);
  const [slotCache, setSlotCache] = useState<Record<string, Slot[]>>({});
  const [slotErr, setSlotErr] = useState('');
  const [selDate, setSelDate] = useState<string>();
  const [selSlot, setSelSlot] = useState<Slot>();
  const [step, setStep] = useState<Step>('pick');
  const [dir, setDir] = useState(1);
  const [booking, setBooking] = useState<Booking>();
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    api.publicEventType(slug).then(setEt).catch(setEtError);
  }, [slug]);

  useEffect(() => {
    document.title = et ? `${et.title} | ${et.ownerName} - MeetFlow` : 'MeetFlow';
    return () => {
      document.title = 'MeetFlow';
    };
  }, [et]);

  const mKey = `${month.y}-${month.m}`;
  useEffect(() => {
    if (!et) return;
    if (slotCache[mKey] && refresh === 0) return;
    const first: YMD = { y: month.y, m: month.m, d: 1 };
    const startDay = month.y === today.y && month.m === today.m ? today : first;
    const from = ymdAdd(startDay, -1);
    const to = ymdAdd({ y: month.y, m: month.m, d: daysInMonth(month.y, month.m) }, 1);
    setSlotErr('');
    api
      .publicSlots(slug, ymdKey(from), ymdKey(to))
      .then((r) => setSlotCache((c) => ({ ...c, [mKey]: r.slots })))
      .catch((e: Error) => setSlotErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [et, mKey, refresh]);

  const slots = slotCache[mKey];
  const byDay = useMemo(() => {
    const map: Record<string, Slot[]> = {};
    for (const s of slots ?? []) {
      const z = zoned(s.start, tz);
      if (z.year !== month.y || z.month !== month.m) continue;
      const k = ymdKey({ y: z.year, m: z.month, d: z.day });
      (map[k] ||= []).push(s);
    }
    for (const k in map) map[k].sort((a, b) => a.start.localeCompare(b.start));
    return map;
  }, [slots, tz, month.y, month.m]);

  // auto-select first available day
  useEffect(() => {
    if (!slots) return;
    if (selDate && byDay[selDate]) return;
    const first = Object.keys(byDay).sort()[0];
    setSelDate(first);
    setSelSlot(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDay]);

  const maxDay = et ? ymdAdd(today, et.maxDaysAhead) : today;
  const canPrev = month.y > today.y || (month.y === today.y && month.m > today.m);
  const canNext = month.y < maxDay.y || (month.y === maxDay.y && month.m < maxDay.m);
  const goMonth = (d: number) => {
    setMonthDir(d);
    setSelDate(undefined);
    setSelSlot(undefined);
    setMonth((mo) => {
      const t = new Date(Date.UTC(mo.y, mo.m - 1 + d, 1));
      return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
    });
  };

  const go = (s: Step) => {
    setDir(STEP_INDEX[s] > STEP_INDEX[step] ? 1 : -1);
    setStep(s);
  };

  if (etError) {
    if (etError instanceof HttpError && etError.status === 404) return <NotFound message="この日程調整ページは見つかりません" />;
    return <NotFound message={etError.message} />;
  }

  const accent = et ? COLOR_HEX[et.color] : '#2fbfab';

  return (
    <div className="pub" style={{ ['--accent' as string]: accent }}>
      <motion.div
        className="pub__card card"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 26 }}
      >
        <aside className="pub__info">
          {!et ? (
            <>
              <Skel w="40%" h={14} />
              <Skel w="80%" h={28} style={{ marginTop: 12 }} />
              <Skel w="60%" h={14} style={{ marginTop: 20 }} />
              <Skel w="50%" h={14} style={{ marginTop: 10 }} />
            </>
          ) : (
            <>
              <div className="pub__owner">
                <span className="pub__owner-mark">{et.ownerName.slice(0, 1)}</span>
                {et.ownerName}
              </div>
              <h1 className="pub__title">{et.title}</h1>
              <ul className="pub__meta">
                <li>
                  <Clock size={17} /> {durationLabel(et.durationMin)}
                </li>
                <li>
                  <LocationIcon type={et.location} size={18} /> {LOCATION_LABEL[et.location]}
                  {et.location === 'google_meet' && <small>（リンクは予約確定後に発行されます）</small>}
                </li>
                {et.requireApproval && (
                  <li>
                    <ShieldCheck size={17} /> 主催者の承認後に確定します
                  </li>
                )}
                <AnimatePresence>
                  {selSlot && step !== 'pick' && (
                    <motion.li className="pub__chosen" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                      <CalendarDays size={17} />
                      <span>
                        {fmtDateWd(selSlot.start, tz, '（）')}
                        <br />
                        {fmtRange(selSlot.start, selSlot.end, tz)}
                      </span>
                    </motion.li>
                  )}
                </AnimatePresence>
              </ul>
              {et.description && <p className="pub__desc">{et.description}</p>}
              <div className="pub__brand">
                <LogoMark size={34} />
                <span>MeetFlow</span>
              </div>
              <div className="legal-links">
                <a href="/privacy" target="_blank" rel="noreferrer">プライバシーポリシー</a>
                <a href="/terms" target="_blank" rel="noreferrer">利用規約</a>
              </div>
            </>
          )}
        </aside>

        <section className="pub__main">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            {step === 'pick' && (
              <motion.div key="pick" className="pub__step pick" custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={slideT}>
                <div className="pick__cal">
                  <h2 className="pub__h2">日時を選択</h2>
                  <div className="cal__head">
                    <button className="icon-btn" onClick={() => goMonth(-1)} disabled={!canPrev} aria-label="前の月">
                      <ChevronLeft size={20} />
                    </button>
                    <AnimatePresence mode="popLayout" initial={false} custom={monthDir}>
                      <motion.span key={mKey} className="cal__month" custom={monthDir} variants={slide} initial="enter" animate="center" exit="exit" transition={slideT}>
                        {month.y}年{month.m}月
                      </motion.span>
                    </AnimatePresence>
                    <button className="icon-btn" onClick={() => goMonth(1)} disabled={!canNext} aria-label="次の月">
                      <ChevronRight size={20} />
                    </button>
                  </div>
                  <div className="cal__wd">
                    {WEEKDAYS_JA.map((w, i) => (
                      <span key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>
                        {w}
                      </span>
                    ))}
                  </div>
                  <div className="cal__viewport">
                    <AnimatePresence mode="popLayout" initial={false} custom={monthDir}>
                      <motion.div key={mKey} className="cal__grid" custom={monthDir} variants={slide} initial="enter" animate="center" exit="exit" transition={slideT}>
                        {Array.from({ length: new Date(Date.UTC(month.y, month.m - 1, 1)).getUTCDay() }).map((_, i) => (
                          <span key={`b${i}`} />
                        ))}
                        {Array.from({ length: daysInMonth(month.y, month.m) }).map((_, i) => {
                          const k = ymdKey({ y: month.y, m: month.m, d: i + 1 });
                          const has = !!byDay[k];
                          const isToday = k === ymdKey(today);
                          const sel = k === selDate;
                          return (
                            <button
                              key={k}
                              className={`cal__day${has ? ' has' : ''}${sel ? ' sel' : ''}${isToday ? ' today' : ''}`}
                              disabled={!has}
                              onClick={() => {
                                setSelDate(k);
                                setSelSlot(undefined);
                              }}
                            >
                              {sel && <motion.span layoutId="cal-sel" className="cal__sel" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                              <span className="cal__num">{i + 1}</span>
                            </button>
                          );
                        })}
                      </motion.div>
                    </AnimatePresence>
                    {!slots && !slotErr && (
                      <div className="cal__loading">
                        <span className="spinner" />
                      </div>
                    )}
                  </div>
                  <div className="pub__tz">
                    <Globe2 size={14} /> {tzLabel(tz)}
                  </div>
                </div>

                <div className="pick__slots">
                  {slotErr ? (
                    <p className="alert">{slotErr}</p>
                  ) : !slots ? (
                    <div className="slots">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <Skel key={i} h={46} r={12} />
                      ))}
                    </div>
                  ) : !selDate ? (
                    <div className="slots__empty">
                      <CalendarDays size={26} />
                      <p>この月に予約可能な日時はありません。</p>
                      {canNext && (
                        <button className="btn btn--glass btn--sm" onClick={() => goMonth(1)}>
                          翌月を見る <ArrowRight size={14} className="btn__arrow" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <h3 className="slots__date">{fmtDateWd(byDay[selDate][0].start, tz, '（）')}</h3>
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                          key={selDate}
                          className="slots"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                        >
                          {byDay[selDate].map((s, i) => {
                            const active = selSlot?.start === s.start;
                            return (
                              <motion.div
                                key={s.start}
                                className="slot-row"
                                initial={{ opacity: 0, x: 12 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: Math.min(i, 12) * 0.025 }}
                              >
                                <motion.button layout className={`slot${active ? ' is-active' : ''}`} onClick={() => setSelSlot(active ? undefined : s)}>
                                  {fmtTime(s.start, tz)}
                                </motion.button>
                                <AnimatePresence>
                                  {active && (
                                    <motion.button
                                      className="btn btn--primary slot__next"
                                      initial={{ opacity: 0, width: 0, marginLeft: 0 }}
                                      animate={{ opacity: 1, width: '48%', marginLeft: 8 }}
                                      exit={{ opacity: 0, width: 0, marginLeft: 0 }}
                                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                                      onClick={() => go('form')}
                                    >
                                      次へ <ArrowRight size={16} className="btn__arrow" />
                                    </motion.button>
                                  )}
                                </AnimatePresence>
                              </motion.div>
                            );
                          })}
                        </motion.div>
                      </AnimatePresence>
                    </>
                  )}
                </div>
              </motion.div>
            )}

            {step === 'form' && et && selSlot && (
              <motion.div key="form" className="pub__step" custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={slideT}>
                <BookingForm
                  et={et}
                  slug={slug}
                  slot={selSlot}
                  tz={tz}
                  onBack={() => go('pick')}
                  onConflict={() => {
                    setSelSlot(undefined);
                    setSlotCache({});
                    setRefresh((r) => r + 1);
                    go('pick');
                  }}
                  onDone={(b) => {
                    setBooking(b);
                    go('done');
                  }}
                />
              </motion.div>
            )}

            {step === 'done' && booking && et && (
              <motion.div key="done" className="pub__step done" custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={slideT}>
                <Done booking={booking} tz={tz} />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </motion.div>
    </div>
  );
}

function BookingForm({
  et,
  slug,
  slot,
  tz,
  onBack,
  onDone,
  onConflict,
}: {
  et: PublicEventType;
  slug: string;
  slot: Slot;
  tz: string;
  onBack: () => void;
  onDone: (b: Booking) => void;
  onConflict: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      setError('お名前と正しいメールアドレスを入力してください。');
      return;
    }
    const missing = et.questions.find((q) => q.required && !answers[q.id]?.trim());
    if (missing) {
      setError(`「${missing.label}」は必須です。`);
      return;
    }
    setBusy(true);
    try {
      const b = await api.book(slug, {
        start: slot.start,
        guestName: name.trim(),
        guestEmail: email.trim(),
        guestCompany: company.trim() || undefined,
        notes: notes.trim() || undefined,
        answers,
      });
      onDone(b);
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) {
        window.alert(err.message || 'この時間はすでに埋まってしまいました。別の時間を選択してください。');
        onConflict();
        return;
      }
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="bform" onSubmit={submit}>
      <button type="button" className="backlink" onClick={onBack}>
        <ArrowLeft size={16} /> 日時を選び直す
      </button>
      <h2 className="pub__h2">お客様情報</h2>
      <div className="bform__when">
        <CalendarDays size={18} />
        {fmtDateWd(slot.start, tz, '（）')} {fmtRange(slot.start, slot.end, tz)}
      </div>
      <div className="form-grid">
        <label className="field">
          <span className="field__label">
            お名前 <em className="req-mark">*</em>
          </span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="山田 太郎" />
        </label>
        <label className="field">
          <span className="field__label">
            メールアドレス <em className="req-mark">*</em>
          </span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="taro@example.com" />
        </label>
        <label className="field span-2">
          <span className="field__label">会社名</span>
          <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" placeholder="株式会社〇〇" />
        </label>
        {et.questions.map((q) => (
          <label className="field span-2" key={q.id}>
            <span className="field__label">
              {q.label} {q.required && <em className="req-mark">*</em>}
            </span>
            <input className="input" value={answers[q.id] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
          </label>
        ))}
        <label className="field span-2">
          <span className="field__label">備考</span>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="事前に共有したいことがあればご記入ください" />
        </label>
      </div>
      <AnimatePresence>
        {error && (
          <motion.p className="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      <button className="btn btn--primary btn--lg btn--block" disabled={busy} style={{ marginTop: 18 }}>
        {busy ? <span className="spinner spinner--sm" /> : null}
        {et.requireApproval ? '予約をリクエストする' : '予約を確定する'}
        <ArrowRight size={18} className="btn__arrow" />
      </button>
    </form>
  );
}

function Done({ booking, tz }: { booking: Booking; tz: string }) {
  const pending = booking.status === 'pending';
  return (
    <div className="done__inner">
      <motion.div
        className={`done__icon${pending ? ' is-pending' : ''}`}
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.15 }}
      >
        {pending ? <Hourglass size={34} /> : <CircleCheck size={38} />}
      </motion.div>
      <h2 className="done__title">{pending ? 'リクエストを送信しました' : '予約が確定しました'}</h2>
      <p className="done__text">
        {pending
          ? '主催者が内容を確認すると予約が確定します。しばらくお待ちください。'
          : booking.googleEventId
            ? `${booking.guestEmail} 宛てにカレンダー招待をお送りしました。当日お会いできるのを楽しみにしています。`
            : '当日お会いできるのを楽しみにしています。この画面を控えておいてください。'}
      </p>
      <div className="done__summary">
        <div>
          <b>{booking.eventTitle}</b>
        </div>
        <div>
          <CalendarDays size={16} /> {fmtDateWd(booking.start, tz, '（）')} {fmtRange(booking.start, booking.end, tz)}
        </div>
        <div>
          <LocationIcon type={booking.location} size={16} /> {LOCATION_LABEL[booking.location]}
          {booking.locationDetail && ` · ${booking.locationDetail}`}
        </div>
        {booking.meetUrl && (
          <a className="btn btn--dark" href={booking.meetUrl} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>
            <Video size={16} /> Google Meet に参加 <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  );
}
