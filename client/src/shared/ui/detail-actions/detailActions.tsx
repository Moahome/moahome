import { Button } from '@/shared/ui/button';
import styles from './detailActions.module.css';

/** 상세의 수정·삭제를 제공하며 모달의 하단 닫기는 호출 화면에서 생략할 수 있습니다. */
export function DetailActions({
  onClose,
  onEdit,
  onDelete,
  busy = false,
  editDisabled = false,
  presentation = 'modal',
  showClose = true,
}: {
  onClose: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  busy?: boolean;
  editDisabled?: boolean;
  presentation?: 'modal' | 'page' | 'inline';
  showClose?: boolean;
}) {
  return (
    <footer
      className={styles.actions}
      data-presentation={presentation}
    >
      {presentation === 'modal' && showClose && (
        <Button
          variant={'outline'}
          tone={'neutral'}
          onClick={onClose}
          disabled={busy}
        >
          닫기
        </Button>
      )}
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
