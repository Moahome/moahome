/** 서버/브라우저 조회시각을 한국시간으로 표시하고 ISO 구분자·소수 초를 출력하지 않습니다. */
export function formatReportTimestamp(value: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} (한국시간)`;
}

/** 조회시각의 한국시간 월을 기준으로 지난 월·현재 월·미래 월의 기간 표시를 구분합니다. */
export function getReportPeriodLabel(data: { month: string; generatedAt: string }): string {
  const currentMonth = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit'
  }).format(new Date(data.generatedAt));
  if (data.month < currentMonth) return `${Number(data.month.slice(5))}월 마감`;
  return data.month === currentMonth ? '집계 중' : '집계 예정';
}

/** 같은 서비스의 한글 폰트만 읽고 업무 자료를 외부 변환 서버로 전송하지 않습니다. */
async function loadFont(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) throw new Error('PDF_FONT_UNAVAILABLE');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}

/** 입출금 명세와 월간 요약에서 같은 A4 세로·한글 폰트 설정을 사용합니다. */
export async function createReportPdfDocument() {
  const [{ jsPDF }, regular, bold] = await Promise.all([import('jspdf'), loadFont('/fonts/pretendard/pretendardRegular.ttf'), loadFont('/fonts/pretendard/pretendardBold.ttf')]);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    putOnlyUsedFonts: true,
    compress: true
  });
  pdf.addFileToVFS('pretendardRegular.ttf', regular);
  pdf.addFont('pretendardRegular.ttf', 'Pretendard', 'normal');
  pdf.addFileToVFS('pretendardBold.ttf', bold);
  pdf.addFont('pretendardBold.ttf', 'Pretendard', 'bold');
  return pdf;
}
