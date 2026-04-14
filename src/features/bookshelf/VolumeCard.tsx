import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Page, Volume } from '../../types';
import {
  LONG_PRESS_MOVE_TOLERANCE_PX,
  LONG_PRESS_MS,
} from '../../lib/constants';
import styles from './BookshelfPage.module.css';

interface Props {
  volume: Volume;
  pages: Page[];
  /** カードタップ時に開くページ番号（lastOpenedPage or 最終更新ページ or 1） */
  initialPage: number;
  /**
   * 長押し削除が確定したときに呼ばれる。volumeId を受け取り、
   * 呼び出し側で DB の deleteVolume と再ロードを担当する。
   */
  onDelete: (volumeId: string) => void | Promise<void>;
}

/**
 * YYYY/MM/DD 形式の日付範囲を返す。
 * - 書きかけ (isActive=true): `YYYY/MM/DD 〜`
 * - 完了済 (isActive=false): `YYYY/MM/DD 〜 YYYY/MM/DD`
 *
 * ローカルタイムで整形する（UTC ISO の先頭10文字だと JST で日付ズレが起きる）。
 */
function formatRange(pages: Page[], isActive: boolean): string {
  if (pages.length === 0) return '';
  const sorted = [...pages].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
  const first = new Date(sorted[0].createdAt);
  const last = new Date(sorted[sorted.length - 1].updatedAt);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  };
  if (isActive) return `${fmt(first)} 〜`;
  return `${fmt(first)} 〜 ${fmt(last)}`;
}

export default function VolumeCard({
  volume,
  pages,
  initialPage,
  onDelete,
}: Props) {
  const isActive = volume.status === 'active';
  const range = formatRange(pages, isActive);

  // 長押し検知用の ref 群。レンダーを伴わないので state ではなく ref。
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
    const n = pages.length;
    const firstMsg =
      n === 0
        ? 'このノートを削除します。よろしいですか？'
        : `このノートと全 ${n} ページを削除します。よろしいですか？`;
    const firstOk = window.confirm(firstMsg);
    if (!firstOk) return;
    if (n >= 1) {
      const secondOk = window.confirm(
        '本当に削除しますか？この操作は取り消せません。'
      );
      if (!secondOk) return;
    }
    await onDelete(volume.id);
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLAnchorElement>) => {
    longPressFiredRef.current = false;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      longPressTimerRef.current = null;
      // 非同期の confirm / onDelete を発火（await は不要）
      void handleLongPress();
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLAnchorElement>) => {
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

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (longPressFiredRef.current) {
      // 長押しが成立した直後の click は Link 遷移させない
      e.preventDefault();
      e.stopPropagation();
      longPressFiredRef.current = false;
    }
  };

  return (
    <Link
      to={`/book/${volume.id}/${initialPage}`}
      className={`${styles.card} ${isActive ? styles.cardActive : ''}`}
      aria-label={`ノート ${volume.ordinal} ${range}`.trim()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={styles.cardOrdinal}>{volume.ordinal}</div>
      <div className={styles.cardRange}>{range || '　'}</div>
      {isActive && <div className={styles.cardBadge}>書きかけ</div>}
    </Link>
  );
}
