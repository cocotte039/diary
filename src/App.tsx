import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import WritePage from './features/write/WritePage';
import BookshelfPage from './features/bookshelf/BookshelfPage';
import SettingsPage from './features/settings/SettingsPage';
import EditorPage from './features/editor/EditorPage';

/**
 * 旧 `/read/:volumeId/:pageNumber` を新 `/book/:volumeId/:pageNumber` に
 * リダイレクトするための小さなラッパ。HashRouter では `<Navigate to>` の
 * 文字列にパラメータを展開できないため useParams 経由で組み立てる。
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
 */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<BookshelfPage />} />
        <Route path="/book/:volumeId/:pageNumber" element={<EditorPage />} />
        <Route path="/read/:volumeId/:pageNumber" element={<ReadRedirect />} />
        <Route path="/bookshelf" element={<Navigate to="/" replace />} />
        <Route path="/write" element={<WritePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
