const pad = (n: number) => String(n).padStart(2, "0");

/** "29/10/2026 3:08:14 PM" — day first, 12-hour time with seconds, local time. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const hours = d.getHours() % 12 || 12;
  const period = d.getHours() < 12 ? "AM" : "PM";
  const time = `${hours}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${period}`;
  return `${date} ${time}`;
}
