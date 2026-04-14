import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { Link } from 'react-router-dom';
import styles from './WritePage.module.css';
import { useWrite } from './useWrite';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useCursorRestore } from '../../hooks/useCursorRestore';
import { PAGES_PER_VOLUME } from '../../lib/constants';
import { countPages, getPageNumber } from '../../lib/pagination';
import {
  dismissA2HSBanner,
  shouldShowA2HSBanner,
} from '../../lib/pwa';
import { registerOnlineSync } from '../../lib/github';

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

function formatToday(): string {
  const d = new Date();
  const w = WEEKDAYS_JA[d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${w})\n`;
}

/**
 * 書く画面。単一 textarea + 罫線背景 + ページ区切りオーバーレイ。
 */
export default function WritePage() {
  // M6-T6: 新冊作成は本棚からのみになったため rotateNow は UI から参照しない。
  // useWrite 側の rotateNow エクスポートは M7 の WritePage 削除時に合わせて整理する。
  const { volume, text, setText, ready } = useWrite();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [cursorPos, setCursorPos] = useState(0);
  const [showBanner, setShowBanner] = useState(false);

  useAutoSave(volume?.id ?? null, text);
  const { onSelectionChange } = useCursorRestore(textareaRef, text, ready);

  // online イベントで同期を再開（1度だけ登録）
  useEffect(() => {
    const un = registerOnlineSync();
    return un;
  }, []);

  // A2HS バナー判定は初回のみ
  useEffect(() => {
    setShowBanner(shouldShowA2HSBanner());
  }, []);

  const currentPage = useMemo(
    () => getPageNumber(cursorPos, text),
    [cursorPos, text]
  );
  const totalPages = useMemo(() => countPages(text), [text]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      setCursorPos(e.target.selectionStart);
      onSelectionChange(e.target.selectionStart);
    },
    [setText, onSelectionChange]
  );

  const handleSelect = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const t = e.currentTarget;
      setCursorPos(t.selectionStart);
      onSelectionChange(t.selectionStart);
    },
    [onSelectionChange]
  );

  const insertDate = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const stamp = formatToday();
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = text.slice(0, start) + stamp + text.slice(end);
    setText(next);
    // カーソルをスタンプ末尾に
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + stamp.length;
      el.setSelectionRange(pos, pos);
      setCursorPos(pos);
    });
  }, [text, setText]);

  const dismissBanner = () => {
    dismissA2HSBanner();
    setShowBanner(false);
  };

  return (
    <div className={styles.root}>
      <nav className={styles.topNav} aria-label="navigation">
        <Link to="/bookshelf" aria-label="本棚">本棚</Link>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link to="/settings" aria-label="設定">設定</Link>
        </div>
      </nav>

      <textarea
        ref={textareaRef}
        className={`notebook-surface notebook-textarea ${styles.textarea}`}
        value={text}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyUp={handleSelect}
        onClick={handleSelect}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="日記本文"
      />

      {/* ページ区切り線オーバーレイ（pointer-events: none） */}
      <div aria-hidden className={styles.dividerOverlay} />

      <div className={styles.pageIndicator} aria-live="off">
        {currentPage} / {Math.max(totalPages, PAGES_PER_VOLUME)}
      </div>

      <button
        type="button"
        className={styles.dateButton}
        onClick={insertDate}
        aria-label="今日の日付を挿入"
      >
        日付
      </button>

      {showBanner && (
        <div className={styles.banner} role="note">
          <span>ホーム画面に追加するとデータが保持されやすくなります</span>
          <button
            type="button"
            className={styles.bannerDismiss}
            onClick={dismissBanner}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
