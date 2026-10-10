/** 국내 휴대폰은 읽기 쉬운 표기로 보이며 국제번호는 서버가 정규화한 번호를 유지합니다. */
export function formatResidentPhone(phone: string) {
  const local = phone.startsWith('+82') ? `0${phone.slice(3)}` : phone;

  return local.replace(/^(01\d)(\d{3,4})(\d{4})$/, '$1-$2-$3');
}
