import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import BookshelfPage from './features/bookshelf/BookshelfPage';
import SettingsPage from './features/settings/SettingsPage';
import EditorPage from './features/editor/EditorPage';
import MemoEditorPage from './features/log/MemoEditorPage';
import LogListPage from './features/log/LogListPage';
import {
  registerOnlineSync,
  syncPendingPagesBackground,
  syncPendingMemosBackground,
} from './lib/github';

/**
 * 旧 `/read/:volumeId/:pageNumber` を新 `/book/:volumeId/:pageNumber` に
 * リダイレクトするための小さなラッパ。HashRouter では `<Navigate to>` の
 * 文字列にパラメータを展開できないため useParams 経由で組み立てる。
 * （既存 URL ブックマーク互換の維持が目的。M7 で WritePage/ReaderPage 本体は削除済み。）
 */
function ReadRedirect() {
  const { volumeId, pageNumber } = useParams();
  if (!volumeId || !pageNumber) return <Navigate to="/" replace />;
  return <Navigate to={`/book/${volumeId}/${pageNumber}`} replace />;
}

/**
 * アプリのルート定義（HashRouter を使用）。
 * HashRouter にする理由: GitHub Pages 等の静的ホスティングで
 * 404 フォールバック無しにディープリンクが動作するため。
 *
 * M7-T5: `/write` ルートは削除。`path="*"` のフォールバックで `/`（本棚）に戻す。
 * ReaderPage も削除済みで、`/read/:id/:page` はここの `ReadRedirect` で
 * `/book/:id/:page` に恒久リダイレクトされる。
 */
export default function App() {
  // GitHub バックアップの再同期トリガをアプリ起動時に一度だけ配線する。
  // - registerOnlineSync: online 復帰イベントで pending を再同期（戻り値=解除関数を cleanup へ）
  // - 起動時フラッシュ: online イベントを取りこぼした場合やオンラインでの
  //   コールド起動でも、溜まった pending を一掃する。syncPendingXxx は
  //   GitHub 未設定 / オフラインを内部ガードで no-op 化し、全 pending 走査・
  //   backoff 付きで冪等のため無条件呼び出しで安全。
  // 元は WritePage に配線されていたが [M7-T5] WritePage 削除で消失していた。
  // 削除されうるページでなく App ルートに置くことで再発を防ぐ。
  // StrictMode(dev) の二重 invoke では add→remove→add で最終 1 リスナーに
  // 収束し、フラッシュは冪等なので二重発火しても無害。
  useEffect(() => {
    const unregister = registerOnlineSync();
    syncPendingPagesBackground();
    syncPendingMemosBackground();
    return unregister;
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<BookshelfPage />} />
        <Route path="/book/:volumeId/:pageNumber" element={<EditorPage />} />
        <Route path="/log" element={<LogListPage />} />
        <Route path="/log/new" element={<MemoEditorPage />} />
        <Route path="/log/:memoId" element={<MemoEditorPage />} />
        <Route path="/read/:volumeId/:pageNumber" element={<ReadRedirect />} />
        <Route path="/bookshelf" element={<Navigate to="/" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
