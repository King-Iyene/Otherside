import { formatMoney } from "@/lib/money";
import { InvalidBadge } from "./HealthBadge";
import type { HealthFlag } from "@/lib/types";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDateShort(raw: string | null | undefined): string {
  if (!raw) return "—";
  const dateStr = raw.slice(0, 10);
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  const month = SHORT_MONTHS[parseInt(parts[1], 10) - 1] || parts[1];
  const day = parseInt(parts[2], 10);
  const year = parts[0];
  return `${month} ${day}, ${year}`;
}

function formatDateTimeShort(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw.slice(0, 10);
  const month = SHORT_MONTHS[d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const hasTime = raw.includes("T");
  if (!hasTime) return `${month} ${day}, ${year}`;
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const time = m ? `${h}:${String(m).padStart(2, "0")} ${ampm}` : `${h} ${ampm}`;
  return `${month} ${day}, ${year} · ${time}`;
}

export default function MoneyCell({ value, field, health }: { value: number | null; field: string; health: HealthFlag[] }) {
  const flag = health.find((f) => f.field === field && f.kind === "unparseable_money");
  if (flag) return <InvalidBadge raw={flag.raw} />;
  return <span className="mono">{formatMoney(value)}</span>;
}

export function DateCell({ value, field, health }: { value: string | null; field: string; health: HealthFlag[] }) {
  const flag = health.find((f) => f.field === field && f.kind === "missing_date");
  if (flag) return <span className="badge muted">MISSING</span>;
  if (!value) return <span>—</span>;
  return <span>{formatDateShort(value)}</span>;
}

export function DateTimeCell({ value, field, health }: { value: string | null; field: string; health: HealthFlag[] }) {
  const flag = health.find((f) => f.field === field && f.kind === "missing_date");
  if (flag) return <span className="badge muted">MISSING</span>;
  if (!value) return <span>—</span>;
  return <span>{formatDateTimeShort(value)}</span>;
}
