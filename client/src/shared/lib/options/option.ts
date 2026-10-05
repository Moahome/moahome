/** 도메인 옵션이 공통 선택 UI에 전달하는 값과 표시 정보를 정의합니다. */
export interface Option<T extends string | number | boolean = string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}
