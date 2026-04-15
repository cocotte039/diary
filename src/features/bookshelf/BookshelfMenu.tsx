import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './BookshelfMenu.module.css';

interface Props {
  onCreateNew: () => void;
  onOpenCalendar: () => void;
}

/**
 * 本棚ヘッダー右端のハンバーガーメニュー。
 * 項目: 新しいノート / カレンダー / 設定
 * 閉じる契機: 外部 pointerdown / Escape / 項目クリック
 */
export default function BookshelfMenu({ onCreateNew, onOpenCalendar }: Props) {
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
            onClick={() => { setOpen(false); onCreateNew(); }}
          >新しいノート</button>
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => { setOpen(false); onOpenCalendar(); }}
          >カレンダー</button>
          <Link
            to="/settings"
            role="menuitem"
            className={styles.item}
            onClick={() => setOpen(false)}
          >設定</Link>
        </div>
      )}
    </div>
  );
}
