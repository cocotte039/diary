import { LS_BANNER_DISMISSED_KEY } from './constants';

/** PWA スタンドアロンモードで起動しているか判定 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia?.('(display-mode: standalone)');
  if (mm?.matches) return true;
  // iOS Safari は独自プロパティを持つ
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return !!nav.standalone;
}

/** iOS Safari を UA から検出（ホーム画面追加促しに使用） */
export function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIOS && isSafari;
}

/** ホーム画面追加バナーを表示すべきか */
export function shouldShowA2HSBanner(): boolean {
  if (isStandalone()) return false;
  if (!isIOSSafari()) return false;
  try {
    return localStorage.getItem(LS_BANNER_DISMISSED_KEY) !== '1';
  } catch {
    return false;
  }
}

/** バナーを dismiss 記録 */
export function dismissA2HSBanner(): void {
  try {
    localStorage.setItem(LS_BANNER_DISMISSED_KEY, '1');
  } catch {
    /* ignore */
  }
}
