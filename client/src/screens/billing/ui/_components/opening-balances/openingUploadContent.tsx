import { FileDropzone } from '@/shared/ui/file-dropzone';
import { Button } from '@/shared/ui/button';
import { ServiceIcon } from '@/shared/ui/service-icon';
import styles from './openingBalances.module.css';

/** PC 모달과 모바일 페이지가 동일한 파일 선택·양식 다운로드를 사용합니다. */
export function OpeningUploadContent({ busy, onFile, onDownload }: {
  busy: boolean;
  onFile: (file: File) => void;
  onDownload: () => void;
}) {
  return (
    <div
      className={styles['upload-content']}
    >
      <FileDropzone
        label={'기존 잔액 엑셀 업로드'}
        inputLabel={'엑셀 파일 선택'}
        accept={'.xlsx'}
        description={'내려받은 양식을 사용해주세요. 5MB·10,000세대까지 지원합니다.'}
        busy={busy}
        onFile={onFile}
      />
      <Button
        variant={'outline'}
        tone={'excel'}
        disabled={busy}
        leadingIcon={(
          <ServiceIcon
            name={'excel'}
          />
        )}
        onClick={onDownload}
      >
        엑셀 양식 다운로드
      </Button>
      <p>
        업로드 후 금액을 확인하고 임시 저장해주세요.
      </p>
    </div>
  );
}
