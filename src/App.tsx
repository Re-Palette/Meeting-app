import { MotionConfig } from 'framer-motion';
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { ToastProvider } from './components/Toast';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import NotFound from './pages/NotFound';

const EventTypes = lazy(() => import('./pages/EventTypes'));
const EventTypeEditor = lazy(() => import('./pages/EventTypeEditor'));
const Bookings = lazy(() => import('./pages/Bookings'));
const Team = lazy(() => import('./pages/Team'));
const Analytics = lazy(() => import('./pages/Analytics'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const PublicBooking = lazy(() => import('./pages/PublicBooking'));

// Warm the route chunks once the app is idle so page transitions never wait on the network.
const warm = () => {
  void import('./pages/EventTypes');
  void import('./pages/EventTypeEditor');
  void import('./pages/Bookings');
  void import('./pages/Team');
  void import('./pages/Analytics');
  void import('./pages/Settings');
};
if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/s/')) {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (ric) ric(warm);
  else window.setTimeout(warm, 1200);
}

function Ambient() {
  return (
    <div className="ambient" aria-hidden>
      <div className="ambient__planet" />
      <div className="ambient__flare" />
    </div>
  );
}

const Fallback = () => (
  <div className="shell__boot">
    <span className="spinner" />
  </div>
);

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <Ambient />
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/s/:slug" element={<PublicBooking />} />
            <Route element={<Shell />}>
              <Route index element={<Dashboard />} />
              <Route path="pages" element={<EventTypes />} />
              <Route path="pages/new" element={<EventTypeEditor />} />
              <Route path="pages/:id" element={<EventTypeEditor />} />
              <Route path="bookings" element={<Bookings />} />
              <Route path="team" element={<Team />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ToastProvider>
    </MotionConfig>
  );
}
