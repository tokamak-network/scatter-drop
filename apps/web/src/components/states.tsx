import type { ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { inkBtnClass, POP_PANEL } from "@/components/pop";

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
    <div className={`bg-white px-6 py-12 text-center space-y-3 ${POP_PANEL}`}>
      <h3 className="font-bold text-ink">{title}</h3>
      {description && <p className="text-sm text-ink/60">{description}</p>}
      {action && (
        <div className="pt-1">
          <Link className={`inline-block text-xs ${inkBtnClass("md")}`} href={action.href}>
            {action.label}
          </Link>
        </div>
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
    <div
      role="status"
      aria-label="Loading"
      className="flex items-center justify-center p-12 text-ink/40"
    >
      <Loader2 aria-hidden="true" className="w-6 h-6 animate-spin" />
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className={`bg-white p-8 text-center text-sm text-ink/60 ${POP_PANEL}`}>
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
    <div className={`bg-pop-pink/40 p-6 space-y-2 ${POP_PANEL}`}>
      <h3 className="font-bold text-ink">{title}</h3>
      {children && <div className="text-sm text-ink/70">{children}</div>}
    </div>
  );
}
