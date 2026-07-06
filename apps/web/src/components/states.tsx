import type { ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { POP_PANEL } from "@/components/pop";

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

/** Centered icon + message box for list pages' loading/error/empty states. */
export function EmptyBox({
  children,
  icon,
  action,
}: {
  children: ReactNode;
  icon?: ReactNode;
  /** Optional trailing CTA (link/button) under the message. */
  action?: ReactNode;
}) {
  return (
    <div className={`flex flex-col items-center justify-center p-12 bg-white text-center space-y-3 ${POP_PANEL}`}>
      {icon}
      <p className="text-ink/60 text-sm max-w-sm">{children}</p>
      {action}
    </div>
  );
}

/** Full-page centered spinner shown while a page's primary query resolves. */
export function PageSpinner() {
  return (
    <div className="flex items-center justify-center p-12 text-ink/40">
      <Loader2 className="w-6 h-6 animate-spin" />
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
