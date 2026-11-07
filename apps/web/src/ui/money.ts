/** `$` and `.` between thousands, no decimals; the minus goes before the `$`. */
export function formatMoney(amount: number): string {
  const whole = Math.round(Math.abs(amount));
  const digits = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return amount < 0 && whole !== 0 ? `-$${digits}` : `$${digits}`;
}
