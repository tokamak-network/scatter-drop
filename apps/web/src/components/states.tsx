import type { ReactNode } from "react";
import Link from "next/link";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div
      className="card"
      style={{ textAlign: "center", padding: "48px 24px" }}
    >
      <h3 style={{ margin: "0 0 8px" }}>{title}</h3>
      {description && (
        <p className="muted" style={{ margin: "0 0 16px" }}>
          {description}
        </p>
      )}
      {action && (
        <Link className="btn btn-primary" href={action.href}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="card muted" style={{ textAlign: "center" }}>
      {label}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="card"
      style={{ borderColor: "var(--color-danger)" }}
    >
      <h3 style={{ margin: "0 0 8px", color: "var(--color-danger)" }}>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}
