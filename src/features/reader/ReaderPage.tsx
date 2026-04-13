import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import styles from './ReaderPage.module.css';
import { getPage, getPagesByVolume } from '../../lib/db';
import { PAGES_PER_VOLUME, SWIPE_THRESHOLD_PX } from '../../lib/constants';

/**
 * 読み返し画面。読み取り専用 div でノート風スタイルを共有。
 * 左スワイプ=次、右スワイプ=前。
 */
export default function ReaderPage() {
  const { volumeId, pageNumber } = useParams();
  const navigate = useNavigate();
  const current = Number(pageNumber ?? '1');
  const [content, setContent] = useState<string>('');
  const [maxPage, setMaxPage] = useState(PAGES_PER_VOLUME);
  const [fading, setFading] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!volumeId) return;
      const [page, all] = await Promise.all([
        getPage(volumeId, current),
        getPagesByVolume(volumeId),
      ]);
      if (cancelled) return;
      setContent(page?.content ?? '');
      setMaxPage(Math.max(all.length, 1));
    })();
    return () => {
      cancelled = true;
    };
  }, [volumeId, current]);

  const go = (delta: number) => {
    const next = current + delta;
    if (next < 1 || next > maxPage) return;
    setFading(true);
    setTimeout(() => {
      navigate(`/read/${volumeId}/${next}`, { replace: true });
      setFading(false);
    }, 180);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const dx = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (dx < 0) go(1); // 左スワイプ → 次
    else go(-1); // 右スワイプ → 前
  };

  return (
    <div
      className={styles.root}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className={styles.top}>
        <Link to="/bookshelf" aria-label="本棚に戻る">← 本棚</Link>
        <div>{current} / {maxPage}</div>
      </div>
      <div
        className={`notebook-surface notebook-reader ${styles.surface} ${
          fading ? styles.fading : ''
        }`}
      >
        {content}
      </div>
    </div>
  );
}
