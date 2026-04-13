import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Calendar.module.css';
import { findPageByDate, getDateSetInMonth } from '../../lib/db';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * シンプルな月カレンダー。
 * - 前月/次月ボタン
 * - 日記がある日に控えめなドット
 * - 日付タップで findPageByDate → /read/:volumeId/:pageNumber へ遷移
 */
export default function Calendar() {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12
  const [hitDates, setHitDates] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getDateSetInMonth(year, month);
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

  const onPick = async (day: number) => {
    const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const hit = await findPageByDate(key);
    if (hit) {
      navigate(`/read/${hit.volumeId}/${hit.pageNumber}`);
    }
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
              onClick={() => onPick(d)}
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
