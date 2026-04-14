import styles from './BookshelfPage.module.css';

/**
 * 本棚グリッド末尾に表示する「新しい冊」カード (M6-T5, A案)。
 * 破線境界の button で、クリック時に親から渡された onCreate を呼ぶ。
 * 確認ダイアログ表示は親 (BookshelfPage.handleCreateNew) の責務。
 */
export default function NewVolumeCard({
  onCreate,
}: {
  onCreate: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.card} ${styles.newCard}`}
      onClick={onCreate}
      aria-label="新しいノートを作る"
    >
      <span className={styles.newCardGlyph} aria-hidden="true">
        ＋
      </span>
      <span className={styles.newCardLabel}>新しいノート</span>
    </button>
  );
}
