import { Link, useLocation } from 'react-router-dom';
import styles from './HeaderTabs.module.css';

/**
 * ヘッダーのタブ切替（本棚 / メモ）。
 * `useLocation().pathname` が `/log` で始まれば「メモ」選択、それ以外は「本棚」。
 *
 * 静けさ原則: アクティブ強調は opacity のみ（色は変えない＝4色厳守）。
 * バッジ/件数カウンタは出さない。transition は 120ms（≤200ms）。
 */
export default function HeaderTabs() {
  const { pathname } = useLocation();
  const isLog = pathname === '/log' || pathname.startsWith('/log/');

  return (
    <nav className={styles.tabs} aria-label="画面切替">
      <Link
        to="/"
        className={`${styles.tab} ${isLog ? styles.inactive : styles.active}`}
        aria-current={isLog ? undefined : 'page'}
      >
        本棚
      </Link>
      <span className={styles.sep} aria-hidden="true">
        /
      </span>
      <Link
        to="/log"
        className={`${styles.tab} ${isLog ? styles.active : styles.inactive}`}
        aria-current={isLog ? 'page' : undefined}
      >
        メモ
      </Link>
    </nav>
  );
}
