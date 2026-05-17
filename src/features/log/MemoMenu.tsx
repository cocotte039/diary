import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './MemoMenu.module.css';

interface Props {
  onOpenCalendar: () => void;
}

/**
 * メモ一覧ヘッダー右端のハンバーガーメニュー（BookshelfMenu の複製改変）。
 * 項目: カレンダー / 設定
 * 閉じる契機: 外部 pointerdown / Escape / 項目クリック
 * 静けさ: 色追加なし・transition は複製元 CSS 準拠（≤200ms）・focus trap なし。
 */
export default function MemoMenu({ onOpenCalendar }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="メニューを開く"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => { setOpen(false); onOpenCalendar(); }}
          >カレンダー</button>
          <Link
            to="/settings"
            state={{ from: '/log' }}
            role="menuitem"
            className={styles.item}
            onClick={() => setOpen(false)}
          >設定</Link>
        </div>
      )}
    </div>
  );
}
