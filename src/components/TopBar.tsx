import { Bell, Plus, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../lib/appContext';
import { item } from '../lib/motion';

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}

export function TopBar({ title, subtitle, actions, back }: Props) {
  const navigate = useNavigate();
  const { pendingCount } = useApp();
  const [q, setQ] = useState('');
  return (
    <motion.header className="topbar" variants={item}>
      <div className="topbar__text">
        {back}
        <h1 className="topbar__title">{title}</h1>
        {subtitle && <p className="topbar__sub">{subtitle}</p>}
      </div>
      <div className="topbar__right">
        {actions}
        <form
          className="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/bookings?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <Search size={19} strokeWidth={2} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ミーティングを検索..." aria-label="ミーティングを検索" />
        </form>
        <Link to="/bookings?tab=pending" className="bell" aria-label={`通知${pendingCount ? `（${pendingCount}件）` : ''}`}>
          <Bell size={24} strokeWidth={1.8} />
          {pendingCount > 0 && <span className="dot" />}
        </Link>
        <div className="plus-pill">
          <Link to="/pages/new" className="plus-pill__ghost" aria-label="日程調整ページを作成">
            <Plus size={18} strokeWidth={2.2} />
          </Link>
          <Link to="/pages/new" className="round-plus" aria-label="新規作成">
            <Plus size={18} strokeWidth={2.2} />
          </Link>
        </div>
      </div>
    </motion.header>
  );
}
