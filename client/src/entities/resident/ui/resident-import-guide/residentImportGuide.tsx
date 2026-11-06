import styles from './residentImportGuide.module.css';

/** 초기 설정과 운영 주민 업로드가 같은 양식·동의 안내를 사용하고 동 없는 양식은 호수로만 설명합니다. */
export function ResidentImportGuide({ hasBuildings, initialSetup = false }: { hasBuildings: boolean; initialSetup?: boolean }) {
  return (
    <section
      className={styles.guide}
      aria-label={'주민 엑셀 작성 안내'}
    >
      <h3>
        작성 안내
      </h3>
      <ul>
        <li>
          {hasBuildings ? '첫 행은 동 · 호수 · 이름 · 연락처 · 주민 구분 · 전화번호 수집 동의 순서로 유지해주세요.' : '첫 행은 호수 · 이름 · 연락처 · 주민 구분 · 전화번호 수집 동의 순서로 유지해주세요.'}
        </li>
        <li>
          {hasBuildings ? '동·호수·이름은 필수이며 연락처와 주민 구분은 선택입니다.' : '호수·이름은 필수이며 연락처와 주민 구분은 선택입니다.'}
        </li>
        <li>
          주민 본인에게 전화번호 수집·이용 동의를 먼저 받고, 동의한 경우에만 전화번호 수집 동의에 O를 입력해주세요.
        </li>
        <li>
          X·빈칸이면 전화번호를 입력했어도 저장하지 않고 연락처 없이 주민만 등록합니다.
        </li>
        <li>
          주민 구분은 소유주·임차인·가족·기타 중 하나로 입력하며 비워두면 기타로 등록합니다.
        </li>
        <li>
          {hasBuildings ? '등록된 동·호수와 일치하도록 입력해주세요.' : '동 열이 없는 양식입니다. 등록된 호수와 일치하도록 입력해주세요.'}
        </li>
        <li>
          호수와 연락처의 앞자리 0을 유지하고 수식은 사용하지 마세요.
        </li>
        <li>
          {initialSetup ? '담당자 단계의 관리소장과 같은 세대·이름인 주민은 제외합니다. 검증 후 선택한 주민을 목록에 추가해주세요.' : '오류·중복은 제외하며 같은 세대의 최초 등록 주민만 대표가 됩니다.'}
        </li>
      </ul>
    </section>
  );
}
