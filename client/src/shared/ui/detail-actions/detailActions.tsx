import { Button } from '@/shared/ui/button';
import styles from './detailActions.module.css';

/** 모바일 상세는 헤더 뒤로가기로 복귀하며 푸터에는 수정·삭제만 남깁니다. 모달은 닫기도 제공합니다. */
export function DetailActions({
  onClose,
  onEdit,
  onDelete,
  busy = false,
  editDisabled = false,
  presentation = 'modal',
}: {
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  busy?: boolean;
  editDisabled?: boolean;
  presentation?: 'modal' | 'page';
}) {
  return (
    <footer
      className={styles.actions}
      data-presentation={presentation}
    >
      {presentation === 'modal' && (
        <Button
          variant={'outline'}
          tone={'neutral'}
          onClick={onClose}
          disabled={busy}
        >
          닫기
        </Button>
      )}
      <Button
        variant={'outline'}
        tone={'success'}
        onClick={onEdit}
        disabled={busy || editDisabled}
      >
        수정
      </Button>
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
