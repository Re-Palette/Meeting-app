import { motion } from 'framer-motion';
import { DatabaseBackup, Download } from 'lucide-react';
import { item } from '../lib/motion';

export function BackupCard() {
  return (
    <motion.section className="card form-card settings__logout" variants={item}>
      <div>
        <b>
          <DatabaseBackup size={18} style={{ verticalAlign: -3, marginRight: 6 }} />
          データのバックアップ
        </b>
        <small>設定・日程調整ページ・予約の記録を1つのファイル（JSON）に保存します。Googleの認証情報は含まれません。</small>
      </div>
      <a className="btn btn--glass" href="/api/export" download>
        <Download size={16} /> データをダウンロード
      </a>
    </motion.section>
  );
}
