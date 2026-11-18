import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Clock, Copy, Plus, Trash2, X, Save, CalendarDays, Globe2, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { EventType, EventTypeInput, LocationType, TimeRange, WeeklyAvailability } from '../../shared/types';
import { COLOR_HEX } from '../components/dashboard/PagesTable';
import { ErrorState } from '../components/EmptyState';
import { LocationIcon } from '../components/LocationPill';
import { Segmented } from '../components/Segmented';
import { Skel } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { Toggle } from '../components/Toggle';
import { TopBar } from '../components/TopBar';
import { api, HttpError } from '../lib/api';
import { useApp } from '../lib/appContext';
import { item } from '../lib/motion';
import { durationLabel, givenName, LOCATION_LABEL, slugify, WEEKDAYS_JA } from '../lib/time';

const DAY_ORDER = ['1', '2', '3', '4', '5', '6', '0'];
const PRESETS = [15, 30, 45, 60, 90];
const COLORS: EventType['color'][] = ['teal', 'blue', 'purple', 'orange', 'pink'];
const LOCS: LocationType[] = ['google_meet', 'zoom', 'in_person', 'phone', 'custom'];
const DETAIL_PLACEHOLDER: Record<LocationType, string> = {
  google_meet: '',
  zoom: 'https://zoom.us/j/...',
  in_person: '東京都渋谷区… / 会議室名',
  phone: '090-xxxx-xxxx（または「ゲストの番号に発信」）',
  custom: 'URLや案内文',
};

const defaultAvailability = (): WeeklyAvailability => {
  const a: WeeklyAvailability = {};
  for (const d of ['1', '2', '3', '4', '5']) a[d] = [{ start: '09:00', end: '18:00' }];
  return a;
};

const blank = (): EventTypeInput => ({
  slug: '',
  title: '',
  description: '',
  durationMin: 30,
  location: 'google_meet',
  locationDetail: '',
  color: 'teal',
  active: true,
  requireApproval: false,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minNoticeHours: 24,
  maxDaysAhead: 60,
  slotIntervalMin: 30,
  availability: defaultAvailability(),
  questions: [],
});

const uid = () => Math.random().toString(36).slice(2, 10);

export default function EventTypeEditor() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const { ownerName } = useApp();
  const [form, setForm] = useState<EventTypeInput>(blank);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<Error>();
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rand] = useState(() => Math.random().toString(36).slice(2, 8));
  const [customDur, setCustomDur] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .eventType(id)
      .then((et) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _i, createdAt: _c, ...rest } = et;
        setForm({ ...blank(), ...rest });
        setCustomDur(!PRESETS.includes(et.durationMin));
      })
      .catch(setLoadError)
      .finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof EventTypeInput>(k: K, v: EventTypeInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  const onTitle = (t: string) => {
    setForm((f) => ({ ...f, title: t, slug: slugTouched ? f.slug : t ? slugify(t, rand) : '' }));
    setErrors((e) => ({ ...e, title: '', slug: '' }));
  };

  const setDay = (day: string, ranges: TimeRange[]) =>
    setForm((f) => ({ ...f, availability: { ...f.availability, [day]: ranges } }));

  const copyToAll = (day: string) => {
    const src = form.availability[day] ?? [];
    setForm((f) => {
      const a: WeeklyAvailability = {};
      for (const d of DAY_ORDER) a[d] = (f.availability[d]?.length ?? 0) > 0 || d === day ? src.map((r) => ({ ...r })) : [];
      return { ...f, availability: a };
    });
    toast('受付中の曜日にコピーしました');
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'タイトルを入力してください';
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(form.slug)) e.slug = '半角英小文字・数字・ハイフンで3文字以上';
    if (!form.durationMin || form.durationMin < 5) e.durationMin = '5分以上で設定してください';
    for (const d of DAY_ORDER)
      for (const r of form.availability[d] ?? []) if (r.start >= r.end) e.availability = '終了時刻は開始時刻より後にしてください';
    if (form.questions.some((q) => !q.label.trim())) e.questions = '質問文を入力してください';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) {
      toast('入力内容を確認してください', 'error');
      return;
    }
    setSaving(true);
    try {
      if (isNew) await api.createEventType(form);
      else await api.updateEventType(id!, form);
      toast(isNew ? '日程調整ページを作成しました' : '変更を保存しました');
      navigate('/pages');
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) setErrors((e) => ({ ...e, slug: err.message || 'このURLは既に使われています' }));
      toast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const durOptions = useMemo(
    () => [...PRESETS.map((p) => ({ value: String(p), label: `${p}分` })), { value: 'custom', label: 'カスタム' }],
    [],
  );

  const back = (
    <Link to="/pages" className="backlink">
      <ArrowLeft size={16} /> 日程調整ページ
    </Link>
  );

  if (loadError)
    return (
      <>
        <TopBar title="ページを編集" back={back} />
        <div className="card">
          <ErrorState error={loadError} />
        </div>
      </>
    );

  return (
    <>
      <TopBar
        title={isNew ? '新しい日程調整ページ' : 'ページを編集'}
        subtitle={isNew ? '用途に合わせて、時間や受付ルールを設定しましょう。' : form.title}
        back={back}
      />
      <div className="editor">
        <div className="editor__main">
          {loading ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="card">
                <Skel w="30%" h={20} />
                <Skel h={44} style={{ marginTop: 18 }} />
                <Skel h={44} style={{ marginTop: 12 }} />
              </div>
            ))
          ) : (
            <>
              <motion.section className="card form-card" variants={item}>
                <h2 className="form-card__title">基本情報</h2>
                <div className="form-grid">
                  <label className="field span-2">
                    <span className="field__label">タイトル</span>
                    <input className="input" value={form.title} onChange={(e) => onTitle(e.target.value)} placeholder="例：初回相談" />
                    {errors.title && <span className="field__error">{errors.title}</span>}
                  </label>
                  <label className="field span-2">
                    <span className="field__label">URL</span>
                    <div className="input-group">
                      <span className="input-group__addon">{window.location.host}/s/</span>
                      <input
                        className="input"
                        value={form.slug}
                        onChange={(e) => {
                          setSlugTouched(true);
                          set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                        }}
                        placeholder="first-meeting"
                      />
                    </div>
                    {errors.slug ? <span className="field__error">{errors.slug}</span> : <span className="field__hint">タイトルから自動生成されます。編集も可能です。</span>}
                  </label>
                  <label className="field span-2">
                    <span className="field__label">説明</span>
                    <textarea
                      className="textarea"
                      value={form.description}
                      onChange={(e) => set('description', e.target.value)}
                      placeholder="ミーティングの目的や事前に準備してほしいことなど"
                    />
                  </label>
                  <div className="field span-2">
                    <span className="field__label">カラー</span>
                    <div className="swatches">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className="swatch"
                          style={{ background: COLOR_HEX[c] }}
                          aria-label={c}
                          aria-pressed={form.color === c}
                          onClick={() => set('color', c)}
                        >
                          {form.color === c && <motion.span layoutId="swatch-ring" className="swatch__ring" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.section>

              <motion.section className="card form-card" variants={item}>
                <h2 className="form-card__title">時間と場所</h2>
                <div className="field">
                  <span className="field__label">所要時間</span>
                  <div className="row-wrap">
                    <Segmented
                      ariaLabel="所要時間"
                      options={durOptions}
                      value={customDur ? 'custom' : String(form.durationMin)}
                      onChange={(v) => {
                        if (v === 'custom') setCustomDur(true);
                        else {
                          setCustomDur(false);
                          set('durationMin', Number(v));
                        }
                      }}
                    />
                    <AnimatePresence>
                      {customDur && (
                        <motion.div
                          className="input-group input-group--num"
                          initial={{ opacity: 0, x: -10, width: 0 }}
                          animate={{ opacity: 1, x: 0, width: 130 }}
                          exit={{ opacity: 0, x: -10, width: 0 }}
                        >
                          <input
                            className="input"
                            type="number"
                            min={5}
                            max={480}
                            step={5}
                            value={form.durationMin}
                            onChange={(e) => set('durationMin', Number(e.target.value))}
                          />
                          <span className="input-group__addon" style={{ paddingRight: 14 }}>
                            分
                          </span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  {errors.durationMin && <span className="field__error">{errors.durationMin}</span>}
                </div>
                <div className="field" style={{ marginTop: 20 }}>
                  <span className="field__label">場所</span>
                  <Segmented
                    ariaLabel="場所"
                    options={LOCS.map((l) => ({
                      value: l,
                      label: (
                        <>
                          <LocationIcon type={l} size={16} />
                          {LOCATION_LABEL[l]}
                        </>
                      ),
                    }))}
                    value={form.location}
                    onChange={(v) => set('location', v)}
                  />
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={form.location}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                      style={{ marginTop: 10 }}
                    >
                      {form.location === 'google_meet' ? (
                        <p className="field__hint">Google カレンダー連携時、予約確定と同時に Meet リンクを自動発行します。</p>
                      ) : (
                        <input
                          className="input"
                          value={form.locationDetail}
                          onChange={(e) => set('locationDetail', e.target.value)}
                          placeholder={DETAIL_PLACEHOLDER[form.location]}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </motion.section>

              <motion.section className="card form-card" variants={item}>
                <h2 className="form-card__title">予約ルール</h2>
                <label className="toggle-row setting-row">
                  <span>
                    <b>承認制にする</b>
                    <small>予約リクエストを確認してから確定します。「対応が必要なリクエスト」に表示されます。</small>
                  </span>
                  <Toggle checked={form.requireApproval} onChange={(v) => set('requireApproval', v)} label="承認制" />
                </label>
                <label className="toggle-row setting-row">
                  <span>
                    <b>公開する</b>
                    <small>オフにするとURLにアクセスしても予約できなくなります。</small>
                  </span>
                  <Toggle checked={form.active} onChange={(v) => set('active', v)} label="公開" />
                </label>
                <div className="form-grid form-grid--4" style={{ marginTop: 16 }}>
                  <NumField label="前の余白" unit="分" value={form.bufferBeforeMin} onChange={(v) => set('bufferBeforeMin', v)} step={5} />
                  <NumField label="後の余白" unit="分" value={form.bufferAfterMin} onChange={(v) => set('bufferAfterMin', v)} step={5} />
                  <NumField label="最短予約" unit="時間前" value={form.minNoticeHours} onChange={(v) => set('minNoticeHours', v)} />
                  <NumField label="受付期間" unit="日先まで" value={form.maxDaysAhead} onChange={(v) => set('maxDaysAhead', v)} />
                  <label className="field">
                    <span className="field__label">開始時刻の間隔</span>
                    <select className="select" value={form.slotIntervalMin} onChange={(e) => set('slotIntervalMin', Number(e.target.value))}>
                      {[10, 15, 20, 30, 45, 60].map((n) => (
                        <option key={n} value={n}>
                          {n}分ごと
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </motion.section>

              <motion.section className="card form-card" variants={item}>
                <h2 className="form-card__title">受付可能な時間</h2>
                <p className="field__hint" style={{ marginTop: -6, marginBottom: 12 }}>
                  曜日ごとに複数の時間帯を設定できます。Google カレンダーの予定とは自動で重ならないように調整されます。
                </p>
                <div className="avail">
                  {DAY_ORDER.map((d) => {
                    const ranges = form.availability[d] ?? [];
                    const on = ranges.length > 0;
                    return (
                      <div key={d} className={`avail__row${on ? '' : ' is-off'}`}>
                        <div className="avail__day">
                          <Toggle checked={on} onChange={(v) => setDay(d, v ? [{ start: '09:00', end: '18:00' }] : [])} label={`${WEEKDAYS_JA[+d]}曜日`} />
                          <span className={+d === 0 ? 'sun' : +d === 6 ? 'sat' : ''}>{WEEKDAYS_JA[+d]}</span>
                        </div>
                        <div className="avail__ranges">
                          {!on && <span className="avail__off">受付なし</span>}
                          <AnimatePresence initial={false}>
                            {ranges.map((r, i) => (
                              <motion.div
                                key={i}
                                className="avail__range"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                              >
                                <input
                                  type="time"
                                  className="input input--sm"
                                  step={900}
                                  value={r.start}
                                  onChange={(e) => setDay(d, ranges.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                                />
                                <span className="muted">–</span>
                                <input
                                  type="time"
                                  className="input input--sm"
                                  step={900}
                                  value={r.end}
                                  onChange={(e) => setDay(d, ranges.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                                />
                                <button
                                  type="button"
                                  className="icon-btn icon-btn--sm"
                                  aria-label="時間帯を削除"
                                  onClick={() => setDay(d, ranges.filter((_, j) => j !== i))}
                                >
                                  <X size={16} />
                                </button>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                        <div className="avail__actions">
                          <button
                            type="button"
                            className="icon-btn icon-btn--sm"
                            aria-label="時間帯を追加"
                            title="時間帯を追加"
                            onClick={() => {
                              const last = ranges[ranges.length - 1];
                              setDay(d, [...ranges, last ? { start: last.end, end: last.end < '21:00' ? addH(last.end) : '23:30' } : { start: '09:00', end: '18:00' }]);
                            }}
                          >
                            <Plus size={16} />
                          </button>
                          <button type="button" className="icon-btn icon-btn--sm" aria-label="他の曜日にコピー" title="受付中の全曜日にコピー" disabled={!on} onClick={() => copyToAll(d)}>
                            <Copy size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {errors.availability && <span className="field__error">{errors.availability}</span>}
              </motion.section>

              <motion.section className="card form-card" variants={item}>
                <h2 className="form-card__title">ゲストへの質問</h2>
                <p className="field__hint" style={{ marginTop: -6, marginBottom: 12 }}>
                  お名前・メールアドレス・会社名・メモは標準で入力欄があります。
                </p>
                <div className="questions">
                  <AnimatePresence initial={false}>
                    {form.questions.map((q, i) => (
                      <motion.div key={q.id} className="question" layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }}>
                        <span className="question__num">Q{i + 1}</span>
                        <input
                          className="input"
                          value={q.label}
                          placeholder="例：ご相談内容を教えてください"
                          onChange={(e) => set('questions', form.questions.map((x) => (x.id === q.id ? { ...x, label: e.target.value } : x)))}
                        />
                        <label className="toggle-row question__req">
                          <Toggle
                            checked={q.required}
                            onChange={(v) => set('questions', form.questions.map((x) => (x.id === q.id ? { ...x, required: v } : x)))}
                            label="必須"
                          />
                          <span>必須</span>
                        </label>
                        <button className="icon-btn icon-btn--sm danger" aria-label="質問を削除" onClick={() => set('questions', form.questions.filter((x) => x.id !== q.id))}>
                          <Trash2 size={16} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                {errors.questions && <span className="field__error">{errors.questions}</span>}
                <button
                  type="button"
                  className="btn btn--glass btn--sm"
                  style={{ marginTop: 12 }}
                  onClick={() => set('questions', [...form.questions, { id: uid(), label: '', required: false }])}
                >
                  <Plus size={15} /> 質問を追加
                </button>
              </motion.section>
            </>
          )}
        </div>

        <motion.aside className="editor__side" variants={item}>
          <div className="preview card">
            <div className="preview__label">プレビュー</div>
            <div className="preview__bar" style={{ background: COLOR_HEX[form.color] }} />
            <div className="preview__owner">{ownerName ? `${givenName(ownerName)}さんとの` : ''}</div>
            <div className="preview__title">{form.title || 'タイトル未設定'}</div>
            <div className="preview__meta">
              <span>
                <Clock size={15} /> {durationLabel(form.durationMin || 0)}
              </span>
              <span>
                <LocationIcon type={form.location} size={16} /> {LOCATION_LABEL[form.location]}
              </span>
              {form.requireApproval && (
                <span>
                  <ShieldCheck size={15} /> 承認後に確定
                </span>
              )}
              <span>
                <CalendarDays size={15} /> {form.maxDaysAhead}日先まで予約可
              </span>
              <span>
                <Globe2 size={15} /> {window.location.host}/s/{form.slug || '...'}
              </span>
            </div>
            {form.description && <p className="preview__desc">{form.description}</p>}
            <div className="preview__days">
              {DAY_ORDER.map((d) => (
                <span key={d} className={(form.availability[d]?.length ?? 0) > 0 ? 'on' : ''}>
                  {WEEKDAYS_JA[+d]}
                </span>
              ))}
            </div>
          </div>
          <div className="editor__save">
            <button className="btn btn--ghost" onClick={() => navigate('/pages')}>
              キャンセル
            </button>
            <button className="btn btn--primary btn--lg" onClick={save} disabled={saving || loading}>
              {saving ? <span className="spinner spinner--sm" /> : <Save size={17} />}
              {isNew ? '作成する' : '保存する'}
            </button>
          </div>
        </motion.aside>
      </div>
    </>
  );
}

function addH(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${String(Math.min(23, h + 2)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function NumField({ label, unit, value, onChange, step = 1 }: { label: string; unit: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <div className="input-group">
        <input className="input" type="number" min={0} step={step} value={value} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
        <span className="input-group__addon" style={{ paddingRight: 12 }}>
          {unit}
        </span>
      </div>
    </label>
  );
}
