import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import BookshelfPage from './features/bookshelf/BookshelfPage';
import SettingsPage from './features/settings/SettingsPage';
import EditorPage from './features/editor/EditorPage';

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
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<BookshelfPage />} />
        <Route path="/book/:volumeId/:pageNumber" element={<EditorPage />} />
        <Route path="/read/:volumeId/:pageNumber" element={<ReadRedirect />} />
        <Route path="/bookshelf" element={<Navigate to="/" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
