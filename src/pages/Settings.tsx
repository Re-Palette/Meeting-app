import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, Check, CircleAlert, Link2, LogOut, Plus, Save, Trash2, UserRound, ArrowRight, Unplug, CalendarClock } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Settings, SettingsInput } from '../../shared/types';
import { InstallCard } from '../components/InstallCard';
import { BusyRulesEditor, calendarOptions, ruleError } from '../components/BusyRules';
import { ErrorState } from '../components/EmptyState';
import { Avatar } from '../components/Avatar';
import { GoogleLogo } from '../components/GoogleLogo';
import { MembersCard } from '../components/Members';
import { Skel } from '../components/Skeleton';
import { useToast } from '../components/Toast';
import { TopBar } from '../components/TopBar';
import { api, type GoogleCalendar } from '../lib/api';
import { useApp } from '../lib/appContext';
import { item } from '../lib/motion';
import { tzLabel } from '../lib/time';


const FALLBACK_TZ = ['Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Kolkata', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Australia/Sydney', 'Pacific/Auckland', 'UTC'];

function allTimezones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (fn) return fn('timeZone');
  } catch {
    /* ignore */
  }
  return FALLBACK_TZ;
}

let calsCache: GoogleCalendar[] | undefined;

export default function SettingsPage() {
  const { settings: ctxSettings, setSettings: setCtx, isOwner, user } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Start from the settings already loaded by the app shell so the page renders fully on its first frame
  // (no skeleton → content swap during the page transition); load() below refreshes them.
  const [settings, setSettings] = useState<Settings | undefined>(ctxSettings);
  const [form, setForm] = useState<SettingsInput | undefined>(() => {
    if (!ctxSettings) return undefined;
    const { googleConnected: _g, googleEmail: _e, ...rest } = ctxSettings;
    void _g;
    void _e;
    return { ...rest, busyRules: rest.busyRules ?? [] };
  });
  const [error, setError] = useState<Error>();
  const [saving, setSaving] = useState(false);
  const [cals, setCalsState] = useState<GoogleCalendar[] | undefined>(calsCache);
  const setCals = (c: GoogleCalendar[] | undefined) => {
    calsCache = c;
    setCalsState(c);
  };
  const [calsError, setCalsError] = useState('');
  const [gError, setGError] = useState('');
  const [gBusy, setGBusy] = useState(false);
  const [newIcs, setNewIcs] = useState('');
  const [showRuleErrors, setShowRuleErrors] = useState(false);
  const tzs = useMemo(allTimezones, []);

  const load = () => {
    setError(undefined);
    api
      .settings()
      .then((s) => {
        setSettings(s);
        setCtx(s);
        const { googleConnected: _g, googleEmail: _e, ...rest } = s;
        void _g;
        void _e;
        setForm({ ...rest, busyRules: rest.busyRules ?? [] });
        setShowRuleErrors(false);
      })
      .catch(setError);
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const googleHandled = useRef(false);
  useEffect(() => {
    const g = params.get('google');
    if (!g || googleHandled.current) return;
    googleHandled.current = true;
    if (g === 'connected') toast('Google カレンダーと連携しました');
    else toast('Google カレンダーとの連携に失敗しました', 'error');
    const p = new URLSearchParams(params);
    p.delete('google');
    setParams(p, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!settings?.googleConnected) return;
    api
      .googleCalendars()
      .then(setCals)
      .catch((e: Error) => setCalsError(e.message));
  }, [settings?.googleConnected]);

  const dirty = useMemo(() => {
    if (!form || !ctxSettings) return false;
    return (
      form.ownerName !== ctxSettings.ownerName ||
      form.timezone !== ctxSettings.timezone ||
      form.googleTargetCalendarId !== ctxSettings.googleTargetCalendarId ||
      JSON.stringify(form.googleCalendarIds) !== JSON.stringify(ctxSettings.googleCalendarIds) ||
      JSON.stringify(form.icsUrls) !== JSON.stringify(ctxSettings.icsUrls) ||
      JSON.stringify(form.busyRules ?? []) !== JSON.stringify(ctxSettings.busyRules ?? [])
    );
  }, [form, ctxSettings]);

  const save = async () => {
    if (!form) return;
    if ((form.busyRules ?? []).some((r) => ruleError(r))) {
      setShowRuleErrors(true);
      toast('「予定の前後をブロック」の入力内容を確認してください', 'error');
      document.querySelector('.rules')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSaving(true);
    try {
      const s = await api.saveSettings(form);
      setSettings(s);
      setCtx(s);
      toast('設定を保存しました');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const connect = async () => {
    setGBusy(true);
    setGError('');
    try {
      const { url } = await api.googleAuthUrl();
      window.location.href = url;
    } catch (e) {
      setGError((e as Error).message);
      setGBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Google カレンダーとの連携を解除しますか？')) return;
    setGBusy(true);
    try {
      await api.googleDisconnect();
      toast('連携を解除しました');
      setCals(undefined);
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setGBusy(false);
    }
  };

  const addIcs = () => {
    const u = newIcs.trim().replace(/^webcal:\/\//i, 'https://');
    if (!form || !u) return;
    if (!/^https?:\/\//i.test(u)) {
      toast('http(s):// または webcal:// で始まるURLを入力してください', 'error');
      return;
    }
    if (form.icsUrls.includes(u)) return;
    setForm({ ...form, icsUrls: [...form.icsUrls, u] });
    setNewIcs('');
  };

  if (error)
    return (
      <>
        <TopBar title="設定" />
        <div className="card">
          <ErrorState error={error} onRetry={load} />
        </div>
      </>
    );

  return (
    <>
      <TopBar title="設定" subtitle="プロフィールとカレンダー連携を管理します。" />
      <div className="settings">
        <motion.section className="card form-card" variants={item}>
          <h2 className="form-card__title">
            <UserRound size={20} /> プロフィール
          </h2>
          {!form ? (
            <Skel h={100} />
          ) : (
            <>
            {user && (
              <div className="profile__who">
                <Avatar name={form.ownerName || user.email || 'M'} size={52} src={user.picture} />
                <div>
                  <b>{form.ownerName || user.name || 'オーナー'}</b>
                  <small>
                    {user.email || 'Google未連携'}
                    <span className={`badge ${user.role === 'owner' ? 'badge--owner' : 'badge--live'}`}>{user.role === 'owner' ? 'オーナー' : 'メンバー'}</span>
                  </small>
                </div>
              </div>
            )}
            <div className="form-grid">
              <label className="field">
                <span className="field__label">表示名</span>
                <input className="input" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} placeholder="鈴木 陽大" />
                <span className="field__hint">ホームのあいさつと公開予約ページに表示されます。</span>
                {user?.email && <span className="field__hint">Googleアカウントの名前が自動で入ります。変更すると、その名前が優先されます。</span>}
              </label>
              <label className="field">
                <span className="field__label">タイムゾーン</span>
                <select className="select" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                  {(tzs.includes(form.timezone) ? tzs : [form.timezone, ...tzs]).map((t) => (
                    <option key={t} value={t}>
                      {tzLabel(t)}
                    </option>
                  ))}
                </select>
                <span className="field__hint">受付時間はこのタイムゾーンで解釈されます。</span>
              </label>
            </div>
            </>
          )}
        </motion.section>

        <motion.section className="card form-card gcal" variants={item}>
          <h2 className="form-card__title">
            <GoogleLogo /> Google カレンダー連携
            {settings?.googleConnected && (
              <span className="badge badge--live" style={{ marginLeft: 'auto' }}>
                <Check size={13} /> 連携中
              </span>
            )}
          </h2>
          {!settings || !form ? (
            <Skel h={90} />
          ) : !settings.googleConnected ? (
            <div className="gcal__connect">
              <p>
                Google カレンダーと連携すると、既存の予定と重なる時間を自動的に予約不可にし、確定した予定を Google Meet リンク付きでカレンダーへ登録します。
              </p>
              <button className="btn btn--dark btn--lg" onClick={connect} disabled={gBusy}>
                {gBusy ? <span className="spinner spinner--sm" /> : <RefreshCw size={18} />}
                Google カレンダーと連携する
                <ArrowRight size={16} className="btn__arrow" />
              </button>
              <AnimatePresence>
                {gError && (
                  <motion.p className="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <CircleAlert size={16} /> {gError}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="gcal__connected">
              <div className="gcal__account">
                <GoogleLogo size={28} />
                <div>
                  <b>{settings.googleEmail}</b>
                  <small>このアカウントのカレンダーを参照しています</small>
                </div>
                <button className="btn btn--glass btn--sm" onClick={disconnect} disabled={gBusy} style={{ marginLeft: 'auto' }}>
                  <Unplug size={15} /> 連携を解除
                </button>
              </div>
              <div className="form-grid">
                <div className="field">
                  <span className="field__label">空き時間の確認に使うカレンダー</span>
                  {calsError ? (
                    <p className="alert">
                      <CircleAlert size={16} /> {calsError}
                    </p>
                  ) : !cals ? (
                    <Skel h={90} />
                  ) : (
                    <div className="checklist">
                      {cals.map((c) => {
                        const checked = form.googleCalendarIds.includes(c.id) || (c.primary && form.googleCalendarIds.includes('primary'));
                        return (
                          <label key={c.id} className={`check${checked ? ' is-on' : ''}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const ids = form.googleCalendarIds.filter((x) => x !== c.id && !(c.primary && x === 'primary'));
                                setForm({ ...form, googleCalendarIds: e.target.checked ? [...ids, c.primary ? 'primary' : c.id] : ids });
                              }}
                            />
                            <span className="check__box">
                              <Check size={13} strokeWidth={3} />
                            </span>
                            <span className="check__label">{c.summary}</span>
                            {c.primary && <span className="badge badge--off">メイン</span>}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                <label className="field">
                  <span className="field__label">予定を登録するカレンダー</span>
                  <select className="select" value={form.googleTargetCalendarId} onChange={(e) => setForm({ ...form, googleTargetCalendarId: e.target.value })}>
                    {(cals ?? [{ id: 'primary', summary: 'メインカレンダー', primary: true }]).map((c) => (
                      <option key={c.id} value={c.primary ? 'primary' : c.id}>
                        {c.summary}
                        {c.primary ? '（メイン）' : ''}
                      </option>
                    ))}
                  </select>
                  <span className="field__hint">確定した予定は Google Meet リンク付きでこのカレンダーに追加されます。</span>
                </label>
              </div>
            </div>
          )}
        </motion.section>

        <motion.section className="card form-card" variants={item}>
          <h2 className="form-card__title">
            <Link2 size={20} /> その他のカレンダー（ICS）
          </h2>
          <p className="field__hint" style={{ marginBottom: 14, lineHeight: 1.7 }}>
            iCloud や Outlook のカレンダーを「予定あり」として取り込めます。iCloud はカレンダー共有の「公開カレンダー」のURL、Outlook は「予定表の公開」で発行される ICS
            のURL（非公開アドレス）を貼り付けてください。URLは第三者に知られないよう注意してください。
          </p>
          {!form ? (
            <Skel h={60} />
          ) : (
            <>
              <ul className="ics">
                <AnimatePresence initial={false}>
                  {form.icsUrls.map((u) => (
                    <motion.li key={u} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                      <span className="pill-link">
                        <span className="pill-link__text">{u}</span>
                      </span>
                      <button className="icon-btn icon-btn--sm danger" aria-label="削除" onClick={() => setForm({ ...form, icsUrls: form.icsUrls.filter((x) => x !== u) })}>
                        <Trash2 size={16} />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              <form
                className="ics__add"
                onSubmit={(e) => {
                  e.preventDefault();
                  addIcs();
                }}
              >
                <input className="input" value={newIcs} onChange={(e) => setNewIcs(e.target.value)} placeholder="https://p01-caldav.icloud.com/published/2/..." />
                <button className="btn btn--glass" type="submit" disabled={!newIcs.trim()}>
                  <Plus size={16} /> 追加
                </button>
              </form>
            </>
          )}
        </motion.section>

        <motion.section className="card form-card" variants={item} layout="position">
          <h2 className="form-card__title">
            <CalendarClock size={20} /> 予定の前後をブロック
          </h2>
          <p className="field__hint" style={{ marginBottom: 14, lineHeight: 1.7 }}>
            特定の予定の前後に、ミーティングを入れない時間を確保します。例：「学校」という予定のあとは1時間30分ミーティングを入れない。
          </p>
          {!form ? (
            <Skel h={80} />
          ) : (
            <BusyRulesEditor
              rules={form.busyRules ?? []}
              onChange={(busyRules) => setForm({ ...form, busyRules })}
              options={calendarOptions(cals, form.icsUrls)}
              showErrors={showRuleErrors}
            />
          )}
        </motion.section>

        <InstallCard />

        {isOwner && <MembersCard />}

        <motion.section className="card form-card settings__logout" variants={item}>
          <div>
            <b>ログアウト</b>
            <small>この端末からログアウトします。</small>
          </div>
          <button
            className="btn btn--danger"
            onClick={async () => {
              await api.logout().catch(() => {});
              navigate('/login', { replace: true });
            }}
          >
            <LogOut size={16} /> ログアウト
          </button>
        </motion.section>
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div
            className="savebar"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <span>未保存の変更があります</span>
            <button className="btn btn--ghost btn--sm" onClick={load}>
              元に戻す
            </button>
            <button className="btn btn--primary" onClick={save} disabled={saving}>
              {saving ? <span className="spinner spinner--sm" /> : <Save size={16} />} 保存する
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
