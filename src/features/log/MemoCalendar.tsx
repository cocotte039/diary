import { useEffect, useMemo, useState } from 'react';
import styles from './MemoCalendar.module.css';
import { getMemoDateSetInMonth } from '../../lib/db';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

interface Props {
  /** メモのある日タップ時に dateKey (YYYY-MM-DD) を渡す。空メモ日は無反応。 */
  onPick: (dateKey: string) => void;
}

/**
 * メモ専用の月カレンダー（Calendar.tsx の複製改変）。
 * - 前月/次月ボタン
 * - メモがある日に控えめなドット（getMemoDateSetInMonth, memos 対象・別管理）
 * - 視覚（ドット色/opacity/サイズ・月送り・fade）は日記カレンダーと完全同一
 * - 日付タップ: メモのある日のみ onPick(dateKey)。空メモ日は早期 return で無反応
 *   （合意・Skeptic／視覚フィードバック追加なし＝静けさ）
 */
export default function MemoCalendar({ onPick }: Props) {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12
  const [hitDates, setHitDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getMemoDateSetInMonth(year, month);
      if (!cancelled) setHitDates(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = firstDay.getDay();

  const prev = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else setMonth((m) => m - 1);
  };
  const next = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else setMonth((m) => m + 1);
  };

  const onPickDay = (day: number) => {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!hitDates.has(key)) return; // 空メモ日は無反応（合意・Skeptic）
    onPick(key);
  };

  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <button type="button" onClick={prev} aria-label="前月">←</button>
        <div>{year}年 {month}月</div>
        <button type="button" onClick={next} aria-label="次月">→</button>
      </div>
      <div className={styles.grid} role="grid">
        {DOW.map((d) => (
          <div key={d} className={styles.dowCell}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) {
            return <div key={`e-${i}`} className={styles.emptyCell} />;
          }
          const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const hasEntry = hitDates.has(key);
          const isToday =
            year === today.getFullYear() &&
            month === today.getMonth() + 1 &&
            d === today.getDate();
          return (
            <button
              type="button"
              key={`d-${d}`}
              className={`${styles.cell} ${isToday ? styles.cellToday : ''}`}
              onClick={() => onPickDay(d)}
              aria-label={`${year}年${month}月${d}日`}
            >
              {d}
              {hasEntry && <span className={styles.dot} aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
