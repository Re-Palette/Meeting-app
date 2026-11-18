import { AnimatePresence, motion } from 'framer-motion';
import { Suspense, useCallback, useEffect, useState, type ReactElement } from 'react';
import { Navigate, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import type { CurrentUser, Settings } from '../../shared/types';
import { api, UNAUTHORIZED_EVENT } from '../lib/api';
import { AppContext } from '../lib/appContext';
import { pageVariants } from '../lib/motion';
import { browserTz } from '../lib/time';
import { MobileNav, MobileTop, Sidebar } from './Sidebar';

function Frozen({ children }: { children: ReactElement | null }) {
  const [el] = useState(children);
  return el;
}

export function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();
  const [auth, setAuth] = useState<'checking' | 'ok' | 'no'>('checking');
  const [settings, setSettings] = useState<Settings>();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        setUser(r.user ?? null);
        setAuth(r.authenticated ? 'ok' : 'no');
      })
      .catch(() => setAuth('no'));
    const onUnauth = () => navigate('/login', { replace: true, state: { from: window.location.pathname } });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauth);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauth);
  }, [navigate]);

  const refreshPending = useCallback(() => {
    api
      .bookings({ status: 'pending', scope: 'all' })
      .then((b) => setPendingCount(b.length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (auth !== 'ok') return;
    api.settings().then(setSettings).catch(() => {});
    refreshPending();
  }, [auth, refreshPending]);

  if (auth === 'no') return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const ctx = {
    settings,
    user,
    isOwner: user?.role === 'owner',
    setSettings,
    tz: settings?.timezone || browserTz(),
    ownerName: settings?.ownerName || '',
    pendingCount,
    refreshPending,
  };

  return (
    <AppContext.Provider value={ctx}>
      <div className="shell">
        <Sidebar />
        <MobileTop />
        <div className="shell__main">
          {auth === 'checking' ? (
            <div className="shell__boot">
              <span className="spinner" />
            </div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                className="page"
                variants={pageVariants}
                initial="initial"
                animate="enter"
                exit="exit"
              >
                <Suspense
                  fallback={
                    <div className="shell__boot">
                      <span className="spinner" />
                    </div>
                  }
                >
                  <Frozen>{outlet}</Frozen>
                </Suspense>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
        <MobileNav />
      </div>
    </AppContext.Provider>
  );
}
