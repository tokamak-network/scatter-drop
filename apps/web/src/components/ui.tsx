import { Fragment, type ReactNode } from "react";

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
