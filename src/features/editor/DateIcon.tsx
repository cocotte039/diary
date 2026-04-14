/**
 * DateIcon — ヘッダー右端の日付挿入ボタンで使うモノクロ SVG (M7-T3)。
 *
 * 仕様:
 * - 16x16 viewBox、stroke currentColor（親の color を継承）、stroke-width 1.5
 * - カレンダー風: rect + 上部の横線 + 上端の 2 本の縦線（リング）
 * - aria-hidden="true" — 親 button 側で aria-label を持つためスクリーンリーダーには読ませない
 * - className 透過（装飾やサイズ上書きが必要なときに備える）
 *
 * 呼び出し側:
 *   <button aria-label="今日の日付を挿入" onClick={insertDate}><DateIcon /></button>
 * ボタン側で 44x44 の hit area を確保する（Skeptic M3 対応）。
 */
export default function DateIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2.5" y="3.5" width="11" height="10" rx="1" />
      <line x1="2.5" y1="6.5" x2="13.5" y2="6.5" />
      <line x1="5.5" y1="2" x2="5.5" y2="5" />
      <line x1="10.5" y1="2" x2="10.5" y2="5" />
    </svg>
  );
}
