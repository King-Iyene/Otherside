import { formatMoney } from "@/lib/money";
import { InvalidBadge } from "./HealthBadge";
import type { HealthFlag } from "@/lib/types";

export default function MoneyCell({ value, field, health }: { value: number | null; field: string; health: HealthFlag[] }) {
  const flag = health.find((f) => f.field === field && f.kind === "unparseable_money");
  if (flag) return <InvalidBadge raw={flag.raw} />;
  return <span className="mono">{formatMoney(value)}</span>;
}

export function DateCell({ value, field, health }: { value: string | null; field: string; health: HealthFlag[] }) {
  const flag = health.find((f) => f.field === field && f.kind === "missing_date");
  if (flag) return <span className="badge muted">MISSING</span>;
  if (!value) return <span>—</span>;
  return <span>{value.slice(0, 10)}</span>;
}
