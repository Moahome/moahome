import { Button } from '@/shared/ui/button';
import styles from './detailActions.module.css';

/** 상세의 닫기·수정·삭제 순서와 버튼 표현을 공유하고 업무별 처리·수정 가능 여부는 호출자가 정합니다. */
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
      <Button
        variant={'outline'}
        tone={'neutral'}
        onClick={onClose}
        disabled={busy}
      >
        {presentation === 'page' ? '목록으로' : '닫기'}
      </Button>
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
