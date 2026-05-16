import { useNavigate } from 'react-router-dom';
import styles from './BookshelfPage.module.css';

/**
 * 本棚右下に固定表示する円形 FAB。タップでメモ入力画面 (/log/new) を開く。
 *
 * - position: fixed（スクロール非追従）。safe-area-inset を考慮した余白。
 * - 鉛筆 SVG（線画モノクロ, BookshelfMenu のアイコン作法統一: stroke
 *   currentColor / stroke-width 1.5）。
 * - 静けさ: バッジ/件数/アニメ強調なし。press は scale(0.94)+opacity 0.8。
 * - onClick で遷移元 '/' を state.from に渡す（戻り先解決用）。
 */
export default function Fab() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={styles.fab}
      aria-label="メモを書く"
      onClick={() => navigate('/log/new', { state: { from: '/' } })}
    >
      <svg
        className={styles.fabIcon}
        width="22"
        height="22"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M4 20h4L18.5 9.5a2.121 2.121 0 0 0-3-3L5 17v3z M14 7l3 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
