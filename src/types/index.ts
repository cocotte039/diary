/**
 * データモデルの型定義。
 * IndexedDB のスキーマと一致させること（変更時は DBマイグレーション必要）。
 */

export type ISODateString = string;
export type VolumeStatus = 'active' | 'completed';
export type SyncStatus = 'synced' | 'pending';

export interface Volume {
  /** UUID (crypto.randomUUID()) */
  id: string;
  /** 作成日時 (ISO8601) */
  createdAt: ISODateString;
  /** 状態 */
  status: VolumeStatus;
  /**
   * 何冊目か（1-indexed）。表示用・本棚ソートキーとして使用。
   * 単調増加で付与し、削除された冊の ordinal は再利用しない
   * （本棚の並び順が安定するため）。
   */
  ordinal: number;
  /** 最後に開いたページ番号 (1〜PAGES_PER_VOLUME)。未設定なら最終更新ページへフォールバック。 */
  lastOpenedPage?: number;
}

export interface Page {
  /** UUID */
  id: string;
  /** 属する Volume の id */
  volumeId: string;
  /** ページ番号 1〜PAGES_PER_VOLUME */
  pageNumber: number;
  /** 本文（\n 区切り、目安 1200 文字、上限なし。進捗バー計算でのみ参照） */
  content: string;
  /** 初回書き込み日時 */
  createdAt: ISODateString;
  /** 最終更新日時 */
  updatedAt: ISODateString;
  /** GitHub 同期状態 */
  syncStatus: SyncStatus;
}

export interface GitHubSettings {
  token: string;
  owner: string;
  repo: string;
  /** 最終同期日時 */
  lastSyncedAt?: ISODateString;
}

/** エクスポートJSONのフォーマット */
export interface ExportPayload {
  version: number;
  exportedAt: ISODateString;
  volumes: Volume[];
  pages: Page[];
}

/** カレンダー表示用: 日付のある日リスト */
export type DateKey = string; // 'YYYY-MM-DD'
