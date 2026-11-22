import { Button } from '@/shared/ui/button';
import styles from './detailActions.module.css';

/** 상세의 수정·삭제만 제공하고 모달 닫기는 상단 X에서 처리합니다. */
export function DetailActions({
  onEdit,
  onDelete,
  busy = false,
  editDisabled = false,
  presentation = 'modal',
}: {
  onEdit?: () => void;
  onDelete: () => void;
  busy?: boolean;
  editDisabled?: boolean;
  presentation?: 'modal' | 'page' | 'inline';
}) {
  return (
    <footer
      className={styles.actions}
      data-presentation={presentation}
    >
      {onEdit && (
        <Button
          variant={'outline'}
          tone={'success'}
          onClick={onEdit}
          disabled={busy || editDisabled}
        >
          수정
        </Button>
      )}
      <Button
        variant={'outline'}
        tone={'danger'}
        onClick={onDelete}
        disabled={busy}
      >
        삭제
      </Button>
    </footer>
  );
}
