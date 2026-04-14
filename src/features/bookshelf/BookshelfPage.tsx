import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './BookshelfPage.module.css';
import {
  getAllPages,
  getAllVolumes,
  getLatestUpdatedPageNumber,
} from '../../lib/db';
import type { Page, Volume } from '../../types';
import VolumeCard from './VolumeCard';
import Calendar from './Calendar';

/**
 * 本棚画面。全 Volume をカード表示し、カレンダーから日付ジャンプ可能。
 */
export default function BookshelfPage() {
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [initialPages, setInitialPages] = useState<Map<string, number>>(
    () => new Map()
  );
  const [showCalendar, setShowCalendar] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [vs, ps] = await Promise.all([getAllVolumes(), getAllPages()]);
      if (cancelled) return;
      // createdAt 降順で表示
      vs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      // initialPage 計算: lastOpenedPage 優先、無ければ最終更新ページ、失敗時は 1
      const entries = await Promise.all(
        vs.map(async (v): Promise<[string, number]> => {
          if (typeof v.lastOpenedPage === 'number' && v.lastOpenedPage >= 1) {
            return [v.id, v.lastOpenedPage];
          }
          try {
            const n = await getLatestUpdatedPageNumber(v.id);
            return [v.id, n];
          } catch {
            return [v.id, 1];
          }
        })
      );
      if (cancelled) return;
      setVolumes(vs);
      setPages(ps);
      setInitialPages(new Map(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pagesByVolume = new Map<string, Page[]>();
  for (const p of pages) {
    const arr = pagesByVolume.get(p.volumeId) ?? [];
    arr.push(p);
    pagesByVolume.set(p.volumeId, arr);
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <h1 className={styles.title}>本棚</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link to="/settings">設定</Link>
          <Link to="/">書く</Link>
        </div>
      </header>

      {volumes.length === 0 ? (
        <div className={styles.empty}>まだ冊がありません</div>
      ) : (
        <div className={styles.grid}>
          {volumes.map((v) => (
            <VolumeCard
              key={v.id}
              volume={v}
              pages={pagesByVolume.get(v.id) ?? []}
              initialPage={initialPages.get(v.id) ?? 1}
            />
          ))}
        </div>
      )}

      <div className={styles.calendarToggle}>
        <button
          type="button"
          onClick={() => setShowCalendar((s) => !s)}
          aria-expanded={showCalendar}
        >
          {showCalendar ? 'カレンダーを閉じる' : 'カレンダーを開く'}
        </button>
      </div>
      {showCalendar && <Calendar />}
    </div>
  );
}
