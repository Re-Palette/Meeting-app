import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  ChartNoAxesColumn,
  ChevronDown,
  House,
  LogOut,
  Plus,
  ArrowRight,
  Settings as SettingsIcon,
  SquareCheck,
  Users,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useApp } from '../lib/appContext';
import { Avatar } from './Avatar';
import { Logo, LogoMark } from './Logo';

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { to: '/', label: 'ホーム', short: 'ホーム', icon: House },
  { to: '/pages', label: '日程調整ページ', short: 'ページ', icon: CalendarDays },
  { to: '/bookings', label: '予定一覧', short: '予定', icon: SquareCheck },
  { to: '/team', label: 'チーム', short: 'チーム', icon: Users },
  { to: '/analytics', label: '分析', short: '分析', icon: ChartNoAxesColumn },
  { to: '/settings', label: '設定', short: '設定', icon: SettingsIcon },
];

export function isActive(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(to + '/');
}

const pillSpring = { type: 'spring', stiffness: 380, damping: 32 } as const;

export function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { ownerName, user } = useApp();
  return (
    <aside className="sidebar">
      <Link to="/" className="sidebar__logo" aria-label="MeetFlow ホーム">
        <Logo />
      </Link>
      <nav className="nav" aria-label="メインメニュー">
        {NAV.map((n) => {
          const active = isActive(pathname, n.to);
          const Icon = n.icon;
          return (
            <Link key={n.to} to={n.to} className={`nav__item${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
              {active && <motion.span layoutId="nav-pill" className="nav__pill" transition={pillSpring} />}
              <span className="nav__icon">
                <Icon size={25} strokeWidth={1.7} />
              </span>
              <span className="nav__label">{n.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="promo">
        <span className="promo__ring" aria-hidden />
        <span className="promo__spark" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="M12 0c.6 6.6 5.4 11.4 12 12-6.6.6-11.4 5.4-12 12-.6-6.6-5.4-11.4-12-12C6.6 11.4 11.4 6.6 12 0z" fill="#fff" />
          </svg>
        </span>
        <p className="promo__text">
          今すぐ、
          <br />
          日程調整ページを
          <br />
          作成しましょう
        </p>
        <button className="btn btn--primary promo__btn" onClick={() => navigate('/pages/new')}>
          <Plus size={16} strokeWidth={2.6} />
          新規作成
          <ArrowRight size={16} strokeWidth={2.4} className="btn__arrow" />
        </button>
      </div>

      <UserBlock name={user?.name || user?.email || ownerName} role={user?.role} />
    </aside>
  );
}

function UserBlock({ name, role }: { name: string; role?: 'owner' | 'member' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div className="user" ref={ref}>
      <button className="user__btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Avatar name={name || 'M'} size={50} />
        <span className="user__text">
          <span className="user__name">{name || 'オーナー'}</span>
          {role === 'member' && <small className="user__role">メンバー</small>}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="user__chev">
          <ChevronDown size={18} />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="user__menu"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
          >
            <button
              onClick={() => {
                setOpen(false);
                navigate('/settings');
              }}
            >
              <SettingsIcon size={16} /> 設定
            </button>
            <button
              onClick={async () => {
                await api.logout().catch(() => {});
                navigate('/login', { replace: true });
              }}
            >
              <LogOut size={16} /> ログアウト
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MobileTop() {
  const { pendingCount } = useApp();
  return (
    <header className="mtop">
      <Link to="/" className="mtop__logo">
        <LogoMark size={40} />
        <span>MeetFlow</span>
      </Link>
      <Link to="/bookings?tab=pending" className="icon-btn mtop__bell" aria-label="通知">
        <Bell size={20} />
        {pendingCount > 0 && <span className="dot" />}
      </Link>
      <Link to="/pages/new" className="round-plus round-plus--sm" aria-label="新規作成">
        <Plus size={18} />
      </Link>
    </header>
  );
}

export function MobileNav() {
  const { pathname } = useLocation();
  return (
    <nav className="mnav" aria-label="メインメニュー">
      {NAV.map((n) => {
        const active = isActive(pathname, n.to);
        const Icon = n.icon;
        return (
          <Link key={n.to} to={n.to} className={`mnav__item${active ? ' is-active' : ''}`}>
            {active && <motion.span layoutId="mnav-pill" className="mnav__pill" transition={pillSpring} />}
            <Icon size={20} strokeWidth={1.9} />
            <span>{n.short}</span>
          </Link>
        );
      })}
    </nav>
  );
}
