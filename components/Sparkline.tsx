"use client";

interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  strokeWidth?: number;
}

/**
 * Word-sized inline chart. No axes, no labels — just the trend.
 * Follows the Stripe/Linear pattern: 60-100px wide, 20-32px tall, single color.
 * Renders nothing (invisible spacer of same size) when there's insufficient data,
 * to keep KPI card layouts stable across metrics.
 */
export default function Sparkline({ values, width = 88, height = 28, color = "var(--accent)", fill = true, strokeWidth = 1.5 }: Props) {
  if (values.length < 2) {
    return <span style={{ display: "inline-block", width, height }} aria-hidden />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const padY = strokeWidth + 1;
  const usableH = height - padY * 2;

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = padY + usableH - ((v - min) / range) * usableH;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const path = `M ${points.join(" L ")}`;
  const areaPath = `${path} L ${width},${height} L 0,${height} Z`;

  const fillId = `sparkFill-${Math.abs(color.split("").reduce((a, c) => a + c.charCodeAt(0), 0))}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }} aria-hidden>
      {fill && (
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
      )}
      {fill && <path d={areaPath} fill={`url(#${fillId})`} stroke="none" />}
      <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
