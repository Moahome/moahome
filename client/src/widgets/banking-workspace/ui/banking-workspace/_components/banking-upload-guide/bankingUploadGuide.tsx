import { ServiceIcon } from '@/shared/ui/service-icon';
import {
  BANK_UPLOAD_TEMPLATE_URL,
  COMMON_BANK_UPLOAD_GUIDE
} from '../../../../constant/bankingOptions';
import styles from './bankingUploadGuide.module.css';

/** 원본 양식이 미지원인 은행에만 주민 업로드와 같은 다운로드·작성 안내를 제공합니다. */
export function BankingUploadGuide() {
  return (
    <div>
      <a
        className={styles['template-link']}
        href={BANK_UPLOAD_TEMPLATE_URL}
        download={'moahome_bank_upload_template.xlsx'}
      >
        <ServiceIcon
          name={'excel'}
        />
        엑셀 양식 다운로드
      </a>
      <section
        className={styles.guide}
        aria-label={'공통 양식 작성 안내'}
      >
        <h2>
          작성 안내
        </h2>
        <ul>
          {COMMON_BANK_UPLOAD_GUIDE.map((description) => (
            <li
              key={description}
            >
              {description}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
