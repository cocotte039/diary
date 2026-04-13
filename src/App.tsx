import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import WritePage from './features/write/WritePage';
import BookshelfPage from './features/bookshelf/BookshelfPage';
import ReaderPage from './features/reader/ReaderPage';
import SettingsPage from './features/settings/SettingsPage';

/**
 * アプリのルート定義（HashRouter を使用）。
 * HashRouter にする理由: GitHub Pages 等の静的ホスティングで
 * 404 フォールバック無しにディープリンクが動作するため。
 */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<WritePage />} />
        <Route path="/bookshelf" element={<BookshelfPage />} />
        <Route path="/read/:volumeId/:pageNumber" element={<ReaderPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
