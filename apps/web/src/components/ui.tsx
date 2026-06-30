import { Fragment, type ReactNode } from "react";
import Link from "next/link";

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
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        marginBottom: 24,
        gap: 16,
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: 26 }}>{title}</h1>
        {subtitle && (
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 12,
        padding: "2px 8px",
        borderRadius: 999,
        border: "1px solid var(--color-border)",
        color: "var(--color-text-muted)",
      }}
    >
      {children}
    </span>
  );
}

/** Label-over-value stat card. */
export function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="muted" style={{ fontSize: 13 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{value}</div>
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

/** Card-styled list row: link on the left, muted detail on the right. */
export function RowLink({
  href,
  label,
  detail,
}: {
  href: string;
  label: ReactNode;
  detail: ReactNode;
}) {
  return (
    <Link href={href} className="card row">
      <span>{label}</span>
      <span className="muted">{detail}</span>
    </Link>
  );
}

/**
 * Disabled placeholder action for not-yet-wired flows. The `milestone` makes
 * every stub trivially greppable (e.g. search "M6") when wiring it up.
 */
export function StubButton({
  milestone,
  children,
  primary = false,
}: {
  milestone: string;
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      className={primary ? "btn btn-primary" : "btn"}
      disabled
      title={`Wired up in ${milestone}`}
    >
      {children} ({milestone})
    </button>
  );
}

