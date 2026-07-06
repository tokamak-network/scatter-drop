import { Fragment, type ReactNode } from "react";

/** Chunky pop page header for pages that don't warrant a full PopHero. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  /** Small mono kicker above the title (e.g. the section name). */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        {eyebrow && (
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-ink/50">
            {eyebrow}
          </span>
        )}
        <h1 className="font-chunk uppercase text-3xl md:text-4xl text-ink tracking-tight">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-ink/60 mt-1.5 max-w-2xl">{subtitle}</p>}
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
