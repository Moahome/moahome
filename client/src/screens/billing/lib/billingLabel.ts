export function formatBillingMonth(month: string): string {
  const [year, number] = month.split('-');

  return `${year}년 ${Number(number)}월`;
}
