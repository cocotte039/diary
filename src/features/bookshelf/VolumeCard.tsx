import { Link } from 'react-router-dom';
import type { Page, Volume } from '../../types';
import styles from './BookshelfPage.module.css';

interface Props {
  volume: Volume;
  pages: Page[];
}

function formatRange(pages: Page[]): string {
  if (pages.length === 0) return '';
  const sorted = [...pages].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
  const first = new Date(sorted[0].createdAt);
  const last = new Date(sorted[sorted.length - 1].updatedAt);
  const fmt = (d: Date) => `${d.getFullYear()}.${d.getMonth() + 1}`;
  if (fmt(first) === fmt(last)) return fmt(first);
  return `${fmt(first)} - ${fmt(last)}`;
}

export default function VolumeCard({ volume, pages }: Props) {
  const range = formatRange(pages);
  const isActive = volume.status === 'active';
  return (
    <Link
      to={`/read/${volume.id}/1`}
      className={`${styles.card} ${isActive ? styles.cardActive : ''}`}
      aria-label={`第${volume.ordinal}冊 ${range}`}
    >
      <div className={styles.cardOrdinal}>第{volume.ordinal}冊</div>
      <div className={styles.cardRange}>{range || '　'}</div>
      {isActive && <div className={styles.cardBadge}>書きかけ</div>}
    </Link>
  );
}
