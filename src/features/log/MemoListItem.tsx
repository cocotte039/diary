import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Memo } from '../../types';
import {
  LONG_PRESS_MOVE_TOLERANCE_PX,
  LONG_PRESS_MS,
} from '../../lib/constants';
import { deleteMemo } from '../../lib/db';
import styles from './LogListPage.module.css';

interface Props {
  memo: Memo;
  /** 長押し削除確定後に呼ばれる。呼び出し側で一覧を再ロードする。 */
  onDeleted: () => void | Promise<void>;
}

/** ローカル時刻の HH:MM を返す。 */
function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * メモ一覧の 1 行。タップ→編集遷移、長押し→確認後 deleteMemo。
 * 長押し作法は VolumeCard を丸ごと流用（longPressTimerRef / longPressFiredRef /
 * startX/Y / move tolerance / handleClick guard / onContextMenu preventDefault）。
 * 静けさ: 長押しヒント表示なし、confirm は 1 段・控えめ文言。
 */
export default function MemoListItem({ memo, onDeleted }: Props) {
  const navigate = useNavigate();
  const isEmpty = memo.content.trim() === '';

  // 長押し検知用の ref 群（レンダー不要なので state ではなく ref）。
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleLongPress = async () => {
    const ok = window.confirm('このメモを削除します。よろしいですか？');
    if (!ok) return;
    await deleteMemo(memo.id);
    await onDeleted();
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    longPressFiredRef.current = false;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      longPressTimerRef.current = null;
      void handleLongPress();
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (longPressTimerRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) {
      clearLongPressTimer();
    }
  };

  const handlePointerEnd = () => {
    clearLongPressTimer();
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (longPressFiredRef.current) {
      // 長押し成立直後の click は編集遷移させない。
      e.preventDefault();
      e.stopPropagation();
      longPressFiredRef.current = false;
      return;
    }
    navigate(`/log/${memo.id}`, { state: { from: '/log' } });
  };

  return (
    <div
      className={styles.row}
      role="button"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className={styles.time}>{formatTime(memo.createdAt)}</span>
      {isEmpty ? (
        <span className={styles.emptyMemo}>（空のメモ）</span>
      ) : (
        <span className={styles.preview}>{memo.content}</span>
      )}
    </div>
  );
}
