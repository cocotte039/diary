import { useCallback, useEffect, useState } from 'react';
import styles from './BookshelfPage.module.css';
import {
  deleteVolume,
  ensureActiveVolume,
  getActiveVolume,
  getAllPages,
  getAllVolumes,
  getLatestUpdatedPageNumber,
  getPagesByVolume,
  rotateVolume,
} from '../../lib/db';
import { PAGES_PER_VOLUME } from '../../lib/constants';
import type { Page, Volume } from '../../types';
import VolumeCard from './VolumeCard';
import BookshelfMenu from './BookshelfMenu';
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
  // reload 時にトリガーするカウンタ（新冊作成後の再読み込み用）
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let [vs, ps] = await Promise.all([getAllVolumes(), getAllPages()]);
      // 冊 0 件なら自動で 1 冊作成して再ロード（初回起動 UX）
      if (!cancelled && vs.length === 0) {
        await ensureActiveVolume();
        [vs, ps] = await Promise.all([getAllVolumes(), getAllPages()]);
      }
      if (cancelled) return;
      // ordinal 降順（最新作成を上）。
      // 🟡 J7: 同 ordinal はデータ異常時の保険として createdAt で tie-break。
      vs.sort((a, b) => {
        if (b.ordinal !== a.ordinal) return b.ordinal - a.ordinal;
        return b.createdAt.localeCompare(a.createdAt);
      });

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
  }, [reloadKey]);

  /**
   * M6-T5: 新しい冊を作る。
   * 現在 active 冊のページ数を確認ダイアログに含めて confirm し、
   * OK なら rotateVolume → 本棚を再ロードする。
   * 静けさ原則として、確認後は追加の視覚フィードバック無し（カード増加で伝わる）。
   */
  const handleCreateNew = useCallback(async () => {
    const active = await getActiveVolume();
    if (!active) return;
    const ap = await getPagesByVolume(active.id);
    const count = ap.length;
    const ok = window.confirm(
      `現在のノートは ${count} / ${PAGES_PER_VOLUME} ページです。新しいノートを作りますか？`
    );
    if (!ok) return;
    await rotateVolume(active.id);
    setReloadKey((k) => k + 1);
  }, []);

  /**
   * M8-4-T8-4.3: VolumeCard からの長押し削除要求を受けて冊を削除。
   * 静けさ原則: 失敗時も toast は出さず console.error のみ。成功/失敗いずれも
   * reloadKey を進めて DB 状態を正として再読み込みする。
   */
  const handleDelete = useCallback(async (volumeId: string) => {
    try {
      await deleteVolume(volumeId);
    } catch (err) {
      console.error('deleteVolume failed:', err);
    }
    setReloadKey((k) => k + 1);
  }, []);

  const pagesByVolume = new Map<string, Page[]>();
  for (const p of pages) {
    const arr = pagesByVolume.get(p.volumeId) ?? [];
    arr.push(p);
    pagesByVolume.set(p.volumeId, arr);
  }

  return (
    <div className={styles.root}>
      <header className={`app-header ${styles.header}`}>
        <h1 className={styles.title}>本棚</h1>
        <BookshelfMenu
          onCreateNew={handleCreateNew}
          onOpenCalendar={() => setShowCalendar(true)}
        />
      </header>

      <div className={styles.body}>
        {volumes.length === 0 ? (
          <div className={styles.empty}>まだノートがありません</div>
        ) : (
          <div className={styles.grid}>
            {volumes.map((v) => (
              <VolumeCard
                key={v.id}
                volume={v}
                pages={pagesByVolume.get(v.id) ?? []}
                initialPage={initialPages.get(v.id) ?? 1}
                onDelete={handleDelete}
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
    </div>
  );
}
