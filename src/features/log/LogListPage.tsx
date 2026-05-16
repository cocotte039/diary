import { useCallback, useEffect, useState } from 'react';
import styles from './LogListPage.module.css';
import { dateKey, getAllMemos } from '../../lib/db';
import type { Memo } from '../../types';
import HeaderTabs from '../shared/HeaderTabs';
import MemoListItem from './MemoListItem';

/** dateKey (YYYY-MM-DD) を見出し用 YYYY/MM/DD に変換（VolumeCard formatRange 同表記）。 */
function formatHeading(dk: string): string {
  return dk.replace(/-/g, '/');
}

/**
 * メモ一覧画面（観測ログ）。
 * getAllMemos → createdAt 降順 → dateKey でグルーピング、日付降順（新しい日が上）。
 * 静けさ: 件数カウンタ・バッジなし。空状態は控えめなテキストのみ。
 */
export default function LogListPage() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [ready, setReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // 削除後の再ロード（DB 状態を正として読み直す）。
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await getAllMemos();
      if (cancelled) return;
      setMemos(all);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // createdAt 降順にソートし dateKey でグルーピング（挿入順 = 日付降順）。
  const sorted = [...memos].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  const groups = new Map<string, Memo[]>();
  for (const m of sorted) {
    const dk = dateKey(m.createdAt);
    const arr = groups.get(dk) ?? [];
    arr.push(m);
    groups.set(dk, arr);
  }

  return (
    <div className={styles.root}>
      <header className={`app-header ${styles.header}`}>
        <HeaderTabs />
      </header>

      <div className={styles.body}>
        {ready && memos.length === 0 ? (
          <div className={styles.empty}>まだメモがありません</div>
        ) : (
          [...groups.entries()].map(([dk, items]) => (
            <section key={dk} className={styles.group}>
              <h2 className={styles.dateHeading}>{formatHeading(dk)}</h2>
              {items.map((m) => (
                <MemoListItem key={m.id} memo={m} onDeleted={reload} />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
