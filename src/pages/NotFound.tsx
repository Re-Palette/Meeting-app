import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LogoMark } from '../components/Logo';

export default function NotFound({ message }: { message?: string }) {
  return (
    <div className="center-screen">
      <motion.div
        className="card notfound"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <div className="notfound__mark">
          <LogoMark size={110} />
        </div>
        <div className="notfound__code">404</div>
        <h1 className="notfound__title">{message || 'ページが見つかりません'}</h1>
        <p className="notfound__text">URLが間違っているか、ページが削除または非公開になっている可能性があります。</p>
        <Link to="/" className="btn btn--primary" style={{ marginTop: 18 }}>
          <ArrowLeft size={16} /> ホームへ戻る
        </Link>
      </motion.div>
    </div>
  );
}
