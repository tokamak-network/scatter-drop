import { Fragment, type ReactNode } from "react";

/** Chunky pop page header for pages that don't warrant a full PopHero. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 className="font-chunk uppercase text-3xl md:text-4xl text-ink tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-ink/60 mt-1.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Definition list rendered as a `auto 1fr` grid (see `.def-grid` in globals.css). */
export function DescriptionList({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="def-grid">
      {items.map((item) => (
        <Fragment key={item.label}>
          <dt className="muted">{item.label}</dt>
          <dd>{item.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
