import { motion } from 'framer-motion';
import { ArrowRight, Lock } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { api } from '../lib/api';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';

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
      <motion.form
        className="card login"
        onSubmit={submit}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <div className="login__logo">
          <Logo dark />
        </div>
        <h1 className="login__title">おかえりなさい</h1>
        <p className="login__sub">オーナーパスワードを入力してください。</p>
        <label className="field">
          <span className="field__label">パスワード</span>
          <div className="input-group">
            <span className="input-group__addon">
              <Lock size={16} />
            </span>
            <input
              className="input"
              type="password"
              autoFocus
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
        <button className="btn btn--primary btn--lg btn--block" disabled={busy || !password}>
          {busy ? <span className="spinner spinner--sm" /> : null}
          ログイン
          <ArrowRight size={18} className="btn__arrow" />
        </button>
        <div className="legal-links">
          <a href="/privacy">プライバシーポリシー</a>
          <a href="/terms">利用規約</a>
        </div>
      </motion.form>
    </div>
  );
}
