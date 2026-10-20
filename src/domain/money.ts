const krw = new Intl.NumberFormat("ko-KR");

export function formatKrw(amount: number): string {
  return `${krw.format(amount)}원`;
}

export function isNonNegativeInt(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}
