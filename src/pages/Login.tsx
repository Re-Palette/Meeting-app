import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, CircleAlert, Lock } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleLogo } from '../components/GoogleLogo';
import { Logo } from '../components/Logo';
import { api } from '../lib/api';

const OAUTH_ERRORS: Record<string, string> = {
  not_invited: 'このGoogleアカウントは招待されていません。オーナーに招待を依頼してください。',
  google: 'Googleでのログインに失敗しました。もう一度お試しください。',
};

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const from = (location.state as { from?: string } | null)?.from || '/';
  const errKey = params.get('error');
  const oauthError = errKey ? OAUTH_ERRORS[errKey] ?? OAUTH_ERRORS.google : '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      await api.login(password);
      navigate(from === '/login' ? '/' : from, { replace: true });
    } catch (err) {
      setError((err as Error).message || 'ログインに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <motion.div
        className="card login"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <div className="login__logo">
          <Logo dark />
        </div>
        <h1 className="login__title">おかえりなさい</h1>
        <p className="login__sub">招待されたGoogleアカウントでログインしてください。</p>

        <AnimatePresence>
          {oauthError && (
            <motion.p className="alert login__alert" role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <CircleAlert size={16} /> {oauthError}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Full page navigation: the server redirects to Google and back. */}
        <a className="btn btn--google btn--lg btn--block" href="/api/auth/google" onClick={() => setGoogleBusy(true)}>
          {googleBusy ? <span className="spinner spinner--sm" /> : <GoogleLogo size={20} />}
          Googleでログイン
          <ArrowRight size={18} className="btn__arrow" />
        </a>

        <div className="login__divider">
          <span>オーナーはパスワードでもログインできます</span>
        </div>

        <form className="login__form" onSubmit={submit}>
          <label className="field">
            <span className="field__label">パスワード</span>
            <div className="input-group">
              <span className="input-group__addon">
                <Lock size={16} />
              </span>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </label>
          <motion.p className="form-error" initial={false} animate={{ opacity: error ? 1 : 0, height: error ? 'auto' : 0 }}>
            {error}
          </motion.p>
          <button className="btn btn--dark btn--block" style={{ height: 44 }} disabled={busy || !password}>
            {busy ? <span className="spinner spinner--sm" /> : null}
            パスワードでログイン
            <ArrowRight size={16} className="btn__arrow" />
          </button>
        </form>
        <div className="legal-links">
          <a href="/privacy">プライバシーポリシー</a>
          <a href="/terms">利用規約</a>
        </div>
      </motion.div>
    </div>
  );
}
