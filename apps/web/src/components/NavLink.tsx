"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Nav item that highlights when active. `exact` matches the pathname exactly
 * (for index routes like `/admin` that are a prefix of their children);
 * otherwise it matches the href or any nested route under it.
 */
export function NavLink({
  href,
  label,
  exact = false,
}: {
  href: string;
  label: string;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} className={`nav-link${active ? " is-active" : ""}`}>
      {label}
    </Link>
  );
}
