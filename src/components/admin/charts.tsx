'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';
import { formatMinor } from '@/lib/domain/money';
import { formatHourOfDay as formatHour } from '@/lib/domain/prep-time';

/**
 * The admin dashboard's charts.
 *
 * Hand-rolled inline SVG rather than a charting library: the shapes needed here
 * are a line, a bar and a dot, and a 90 kB dependency to draw them would be the
 * largest thing in the bundle for a page three people open.
 *
 * Rules these follow, and why:
 *  • **One measure per plot.** Two y-scales on one chart make any relationship
 *    the author wants appear real. Orders, signups and revenue are separate
 *    charts sharing an x-axis instead.
 *  • **Marks carry identity, text never does.** Values and labels stay in ink
 *    tokens; the coloured mark beside them says which series it is. That keeps
 *    the numbers readable for everyone, including in forced-colours mode.
 *  • **Colour is validated, not chosen.** The two hues used on the demand map
 *    were checked for deuteranopia/protanopia/tritanopia separation and for
 *    contrast against both surfaces (light #f97316/#2563eb, dark
 *    #ea580c/#3b82f6). Anything added here needs the same check.
 *  • **Every chart has a text equivalent.** Bars and points carry `<title>`, and
 *    the pages below them repeat the same numbers in a table.
 */

const AXIS = 'var(--color-border)';
const INK_MUTED = 'var(--color-muted)';

/** Short "12 Mar" label for a YYYY-MM-DD key. */
function shortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}


export type SeriesPoint = { date: string; value: number };

/**
 * How the y-values should read.
 *
 * A name rather than a formatting *function*, because these charts are client
 * components rendered from server components and a function cannot cross that
 * boundary — React can only serialise data. Passing `format={formatMinor}` looks
 * natural, typechecks, builds, and then fails at render time.
 */
export type ValueFormat = 'count' | 'money';

const FORMATTERS: Record<ValueFormat, (value: number) => string> = {
  count: (value) => value.toLocaleString('en-IN'),
  money: (value) => formatMinor(value),
};

/**
 * Daily line chart with a crosshair readout.
 *
 * A single series, so there is no legend — the title names it. The area fill
 * exists to make a flat line legible at this height, not to imply a volume.
 */
export function TimeSeriesChart({
  title,
  points,
  valueFormat = 'count',
  tone = 'brand',
  className,
}: {
  title: string;
  points: SeriesPoint[];
  valueFormat?: ValueFormat;
  tone?: 'brand' | 'success' | 'info';
  className?: string;
}) {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const format = FORMATTERS[valueFormat];

  const width = 640;
  const height = 180;
  const padding = { top: 12, right: 8, bottom: 22, left: 8 };

  const stroke =
    tone === 'success'
      ? 'var(--color-success-600)'
      : tone === 'info'
        ? 'var(--color-info-600)'
        : 'var(--color-brand-500)';

  if (points.length === 0) {
    return (
      <figure className={cn('rounded-[var(--radius-card)] border border-border bg-surface p-4', className)}>
        <figcaption className="text-sm font-bold">{title}</figcaption>
        <p className="mt-6 pb-6 text-center text-sm text-muted">No data for this period yet.</p>
      </figure>
    );
  }

  const max = Math.max(1, ...points.map((point) => point.value));
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;

  const x = (index: number) => padding.left + index * step;
  const y = (value: number) => padding.top + innerHeight - (value / max) * innerHeight;

  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${padding.top + innerHeight} L${padding.left},${padding.top + innerHeight} Z`;

  const total = points.reduce((sum, point) => sum + point.value, 0);
  const active = hoverIndex != null ? points[hoverIndex] : null;

  return (
    <figure className={cn('rounded-[var(--radius-card)] border border-border bg-surface p-4', className)}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold">{title}</span>
        <span className="text-xs text-muted">
          {active ? (
            <>
              <span className="font-semibold text-foreground">{format(active.value)}</span> on{' '}
              {shortDate(active.date)}
            </>
          ) : (
            <>
              {format(total)} over {points.length} days
            </>
          )}
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${title}: ${format(total)} across ${points.length} days`}
        className="mt-3 w-full"
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Recessive baseline. No gridlines: at this height they would out-weigh
            the data they are meant to support. */}
        <line
          x1={padding.left}
          y1={padding.top + innerHeight}
          x2={width - padding.right}
          y2={padding.top + innerHeight}
          stroke={AXIS}
          strokeWidth={1}
        />

        <path d={area} fill={stroke} opacity={0.12} />
        <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {active && hoverIndex != null ? (
          <>
            <line
              x1={x(hoverIndex)}
              y1={padding.top}
              x2={x(hoverIndex)}
              y2={padding.top + innerHeight}
              stroke={INK_MUTED}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {/* 2px surface ring so the marker stays visible over the fill. */}
            <circle cx={x(hoverIndex)} cy={y(active.value)} r={5} fill={stroke} stroke="var(--color-surface)" strokeWidth={2} />
          </>
        ) : null}

        {/* Invisible full-height hit targets — much easier to hit than the line. */}
        {points.map((point, index) => (
          <rect
            key={point.date}
            x={x(index) - step / 2}
            y={padding.top}
            width={Math.max(step, 6)}
            height={innerHeight}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(index)}
          >
            <title>{`${shortDate(point.date)}: ${format(point.value)}`}</title>
          </rect>
        ))}

        <text x={padding.left} y={height - 6} fontSize={11} fill={INK_MUTED}>
          {shortDate(points[0].date)}
        </text>
        <text x={width - padding.right} y={height - 6} fontSize={11} fill={INK_MUTED} textAnchor="end">
          {shortDate(points[points.length - 1].date)}
        </text>
      </svg>
    </figure>
  );
}

export type HourBucket = { hour: number; orders: number; revenueMinor: number };

/**
 * Orders by hour of day.
 *
 * The rush windows are called out directly on the chart rather than left for the
 * reader to spot, because they are the point of the whole view: a shop that
 * knows its 4–6 PM peak can staff for it.
 */
export function PeakHoursChart({ buckets, className }: { buckets: HourBucket[]; className?: string }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.orders));
  const busiest = buckets.reduce((best, bucket) => (bucket.orders > best.orders ? bucket : best), buckets[0]);

  const breakfast = buckets.filter((b) => b.hour >= 8 && b.hour <= 10).reduce((sum, b) => sum + b.orders, 0);
  const snack = buckets.filter((b) => b.hour >= 16 && b.hour <= 18).reduce((sum, b) => sum + b.orders, 0);
  const total = buckets.reduce((sum, b) => sum + b.orders, 0);

  return (
    <figure className={cn('rounded-[var(--radius-card)] border border-border bg-surface p-4', className)}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold">Orders by hour of day</span>
        <span className="text-xs text-muted">
          Busiest {formatHour(busiest.hour)}–{formatHour((busiest.hour + 1) % 24)} · {busiest.orders} orders
        </span>
      </figcaption>

      <div className="mt-4 flex h-40 items-end gap-[2px]" role="img" aria-label={`Order volume across 24 hours. Busiest hour ${formatHour(busiest.hour)} with ${busiest.orders} orders.`}>
        {buckets.map((bucket) => {
          const heightPercent = (bucket.orders / max) * 100;
          const isRush = (bucket.hour >= 8 && bucket.hour <= 10) || (bucket.hour >= 16 && bucket.hour <= 18);
          return (
            <div key={bucket.hour} className="group flex h-full flex-1 flex-col justify-end">
              <div
                title={`${formatHour(bucket.hour)}: ${bucket.orders} orders · ${formatMinor(bucket.revenueMinor)}`}
                style={{ height: `${Math.max(heightPercent, bucket.orders > 0 ? 3 : 0)}%` }}
                className={cn(
                  // 4px rounded data-end, square against the baseline.
                  'w-full rounded-t-[4px] transition-opacity',
                  isRush ? 'bg-brand-500' : 'bg-brand-500/35',
                  'group-hover:opacity-80',
                )}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex justify-between text-[10px] text-muted">
        {[0, 6, 12, 18, 23].map((hour) => (
          <span key={hour}>{formatHour(hour)}</span>
        ))}
      </div>

      <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
        Breakfast rush (8–10 AM) <span className="font-bold text-foreground">{breakfast}</span> ·{' '}
        Snack rush (4–6 PM) <span className="font-bold text-foreground">{snack}</span>
        {total > 0 ? (
          <> · together {Math.round(((breakfast + snack) / total) * 100)}% of all orders</>
        ) : null}
      </p>
    </figure>
  );
}

export type DemandCell = {
  latitude: number;
  longitude: number;
  orders: number;
  shops: number;
  isColdSpot: boolean;
};

/**
 * Demand against supply, plotted on the raw coordinate plane.
 *
 * Not a real basemap — no tiles are fetched, so nothing about where the
 * platform's customers live is sent to a third party. What matters here is
 * relative position: which clusters of demand have no shop sitting in them.
 *
 * Colour is doing real work, so it was validated rather than picked: warm marks
 * for demand, blue rings for cold spots, checked for CVD separation and contrast
 * against both surfaces. Cold spots also carry a ring and a label, so the map
 * still reads without colour at all.
 */
export function DemandMap({ cells, className }: { cells: DemandCell[]; className?: string }) {
  if (cells.length === 0) {
    return (
      <figure className={cn('rounded-[var(--radius-card)] border border-border bg-surface p-4', className)}>
        <figcaption className="text-sm font-bold">Demand map</figcaption>
        <p className="mt-6 pb-6 text-center text-sm text-muted">
          No located orders yet. Orders record a location only when the customer shares one.
        </p>
      </figure>
    );
  }

  const width = 640;
  const height = 380;
  const pad = 28;

  const lats = cells.map((cell) => cell.latitude);
  const lngs = cells.map((cell) => cell.longitude);
  // A single cell would give a zero-width range and divide by zero; the floor
  // also stops two nearby cells from being flung to opposite corners.
  const latSpan = Math.max(0.02, Math.max(...lats) - Math.min(...lats));
  const lngSpan = Math.max(0.02, Math.max(...lngs) - Math.min(...lngs));
  const minLat = Math.min(...lats);
  const minLng = Math.min(...lngs);

  const px = (lng: number) => pad + ((lng - minLng) / lngSpan) * (width - pad * 2);
  // Latitude increases northward but SVG y increases downward.
  const py = (lat: number) => height - pad - ((lat - minLat) / latSpan) * (height - pad * 2);

  const maxOrders = Math.max(1, ...cells.map((cell) => cell.orders));
  const radius = (orders: number) => 5 + Math.sqrt(orders / maxOrders) * 18;

  const coldSpots = cells.filter((cell) => cell.isColdSpot);

  return (
    <figure className={cn('rounded-[var(--radius-card)] border border-border bg-surface p-4', className)}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-bold">Demand vs shop coverage</span>
        <span className="text-xs text-muted">
          {coldSpots.length} cold spot{coldSpots.length === 1 ? '' : 's'} · ~1 km cells
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Map of ${cells.length} demand cells. ${coldSpots.length} have customer demand but no listed shop.`}
        className="mt-3 w-full rounded-[var(--radius-field)] bg-surface-muted"
      >
        {cells.map((cell) => {
          const key = `${cell.latitude},${cell.longitude}`;
          const cx = px(cell.longitude);
          const cy = py(cell.latitude);

          if (cell.orders === 0) {
            // Supply with no measured demand: a small hollow ink marker, not a
            // third series colour.
            return (
              <g key={key}>
                <circle cx={cx} cy={cy} r={5} fill="none" stroke={INK_MUTED} strokeWidth={1.5} />
                <title>{`${cell.shops} shop(s), no located orders here`}</title>
              </g>
            );
          }

          return (
            <g key={key}>
              <circle
                cx={cx}
                cy={cy}
                r={radius(cell.orders)}
                fill={cell.isColdSpot ? 'var(--chart-cold)' : 'var(--chart-demand)'}
                fillOpacity={cell.isColdSpot ? 0.28 : 0.4}
                stroke={cell.isColdSpot ? 'var(--chart-cold)' : 'var(--chart-demand)'}
                strokeWidth={cell.isColdSpot ? 2.5 : 1.5}
                strokeDasharray={cell.isColdSpot ? '4 3' : undefined}
              />
              <title>
                {`${cell.orders} order(s), ${cell.shops} shop(s)${cell.isColdSpot ? ' — no shop here' : ''}`}
              </title>
            </g>
          );
        })}

        {/* Direct labels on the leads themselves — the map exists to produce
            these, so they should not need a hover to find. */}
        {coldSpots.slice(0, 6).map((cell) => (
          <text
            key={`label-${cell.latitude},${cell.longitude}`}
            x={px(cell.longitude)}
            y={py(cell.latitude) - radius(cell.orders) - 6}
            fontSize={11}
            fontWeight={700}
            textAnchor="middle"
            fill="var(--color-foreground)"
          >
            {cell.orders} orders, no shop
          </text>
        ))}
      </svg>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-full" style={{ background: 'var(--chart-demand)', opacity: 0.5 }} />
          Demand with a shop nearby
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="size-3 rounded-full border-2 border-dashed"
            style={{ borderColor: 'var(--chart-cold)' }}
          />
          Cold spot — demand, no shop
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-full border" style={{ borderColor: INK_MUTED }} />
          Shop with no located orders
        </li>
      </ul>
    </figure>
  );
}
