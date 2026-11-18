import type { ReactNode } from 'react';

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <div className="empty__title">{title}</div>
      {text && <div className="empty__text">{text}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="empty">
      <div className="empty__title">読み込みに失敗しました</div>
      <div className="empty__text">{error.message}</div>
      {onRetry && (
        <button className="btn btn--glass btn--sm" onClick={onRetry} style={{ marginTop: 6 }}>
          再読み込み
        </button>
      )}
    </div>
  );
}
