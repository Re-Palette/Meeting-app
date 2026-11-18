import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { copyText } from '../lib/clipboard';
import { useToast } from './Toast';

export function CopyButton({ text, className = 'icon-btn icon-btn--sm' }: { text: string; className?: string }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  return (
    <button
      type="button"
      className={className}
      aria-label="リンクをコピー"
      title="リンクをコピー"
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copyText(text);
        if (ok) {
          setDone(true);
          toast('リンクをコピーしました');
          window.setTimeout(() => setDone(false), 1600);
        } else toast('コピーできませんでした', 'error');
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={done ? 'y' : 'n'}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{ display: 'grid' }}
        >
          {done ? <Check size={17} color="var(--teal-strong)" /> : <Copy size={17} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
