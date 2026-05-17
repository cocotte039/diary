import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './LogListPage.module.css';
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation';
import { dateKey, getAllMemos } from '../../lib/db';
import type { Memo } from '../../types';
import HeaderTabs from '../shared/HeaderTabs';
import MemoListItem from './MemoListItem';
import MemoMenu from './MemoMenu';
import MemoCalendar from './MemoCalendar';
import Fab from '../bookshelf/Fab';

/** dateKey (YYYY-MM-DD) を見出し用 YYYY/MM/DD に変換（VolumeCard formatRange 同表記）。 */
function formatHeading(dk: string): string {
  return dk.replace(/-/g, '/');
}

/**
 * メモ一覧画面（観測ログ）。
 * getAllMemos → createdAt 降順 → dateKey でグルーピング、日付降順（新しい日が上）。
 * 静けさ: 件数カウンタ・バッジなし。空状態は控えめなテキストのみ。
 *
 * 本棚側と同作法で MemoMenu（カレンダー/設定）・MemoCalendar 全画面モーダル・
 * ペン FAB（/log/new, 戻り先 /log）を追加。日記側は不変。
 */
export default function LogListPage() {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [ready, setReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showCalendar, setShowCalendar] = useState(false);
  const navigate = useNavigate();
  const swipe = useSwipeNavigation({
    onSwipeRight: () => navigate('/'),
    disabled: showCalendar,
  });

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

  // カレンダーモーダル表示中は Esc キーで閉じる（BookshelfPage 同型・cleanup 対称）。
  useEffect(() => {
    if (!showCalendar) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCalendar(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showCalendar]);

  /**
   * カレンダーで選んだ日付グループへ瞬間スクロール。
   * 二重 rAF で state 反映後の描画フレームに scroll を遅延し、overlay unmount と
   * scroll の視覚順序を安定化（plan 裁定: Skeptic C1）。対象 section 不在時は
   * `?.` で null 安全（C2）。
   */
  const scrollToDate = useCallback((dk: string) => {
    setShowCalendar(false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document
          .getElementById(`memo-date-${dk}`)
          ?.scrollIntoView({ block: 'start', behavior: 'auto' })
      )
    );
  }, []);

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
    <div className={styles.root} {...swipe}>
      <header className={`app-header ${styles.header}`}>
        <HeaderTabs />
        <MemoMenu onOpenCalendar={() => setShowCalendar(true)} />
      </header>

      <div className={styles.body}>
        {ready && memos.length === 0 ? (
          <div className={styles.empty}>まだメモがありません</div>
        ) : (
          [...groups.entries()].map(([dk, items]) => (
            <section
              key={dk}
              id={`memo-date-${dk}`}
              className={styles.group}
            >
              <h2 className={styles.dateHeading}>{formatHeading(dk)}</h2>
              {items.map((m) => (
                <MemoListItem key={m.id} memo={m} onDeleted={reload} />
              ))}
            </section>
          ))
        )}

        {showCalendar && (
          <div
            className={styles.calendarOverlay}
            role="dialog"
            aria-modal="true"
            aria-label="カレンダー"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowCalendar(false);
            }}
          >
            <div className={styles.calendarPanel}>
              <button
                type="button"
                className={styles.calendarClose}
                aria-label="カレンダーを閉じる"
                onClick={() => setShowCalendar(false)}
              >×</button>
              <MemoCalendar onPick={scrollToDate} />
            </div>
          </div>
        )}
      </div>

      <Fab from="/log" />
    </div>
  );
}
