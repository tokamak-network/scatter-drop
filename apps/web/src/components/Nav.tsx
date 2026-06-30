"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { Shield, User } from "lucide-react";
import { useIsAdmin } from "@/lib/stub";
import { useMounted } from "@/lib/useMounted";
import { fork } from "@/lib/wagmi";

const LINKS = [
  { href: "/campaigns", label: "Explore", match: ["/campaigns", "/c"] },
  { href: "/claim", label: "My Claims", match: ["/claim"] },
  { href: "/manage", label: "Manage", match: ["/manage"] },
];

function isActive(pathname: string, match: string[]) {
  return match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

function short(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function Nav() {
  const pathname = usePathname();
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const isAdminWallet = useIsAdmin(address);
  const isAdmin = mounted && isAdminWallet;

  const connected = mounted && isConnected && address;
  const injector = connectors[0];

  return (
    <>
      {/* Network banner */}
      <div className="bg-slate-900 border-b border-slate-800 text-[11px] font-mono py-1.5 px-4 text-center text-slate-400 flex items-center justify-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        Connected Chain: <strong className="text-slate-200">{fork.name}</strong>
      </div>

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-4 py-4 md:px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 cursor-pointer select-none">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-white shadow-md shadow-emerald-500/10">
              S
            </div>
            <span className="font-display font-bold text-lg tracking-tight text-slate-50">
              scatter<span className="text-emerald-400">.drop</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-xs font-mono font-medium text-slate-300">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`hover:text-slate-50 transition ${
                  isActive(pathname, l.match)
                    ? "text-emerald-400 border-b-2 border-emerald-500 pb-0.5"
                    : ""
                }`}
              >
                {l.label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                href="/admin"
                className={`hover:text-slate-50 transition flex items-center gap-1.5 ${
                  isActive(pathname, ["/admin"])
                    ? "text-amber-500 border-b-2 border-amber-500 pb-0.5 font-bold"
                    : ""
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-amber-500" /> Admin
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-3 font-mono text-xs">
            {connected ? (
              <button
                onClick={() => disconnect()}
                className="bg-slate-800 border border-slate-700 hover:border-slate-600 px-3 py-1.5 rounded-lg text-slate-100 transition flex items-center gap-2 cursor-pointer"
                title="Click to disconnect"
              >
                <User className="w-3.5 h-3.5 text-slate-300" />
                <span>{short(address)}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </button>
            ) : (
              <button
                onClick={() => injector && connect({ connector: injector })}
                disabled={!injector || isPending}
                className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-4 py-2 rounded-lg transition cursor-pointer disabled:opacity-60"
              >
                {isPending ? "Connecting…" : "Connect Wallet"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <div className="md:hidden border-b border-slate-900/60 bg-slate-950 px-4 py-2 flex justify-around gap-2 text-[11px] font-mono font-medium text-slate-400">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`px-2 py-1 rounded ${
              isActive(pathname, l.match) ? "text-emerald-400 bg-slate-900/40" : ""
            }`}
          >
            {l.label}
          </Link>
        ))}
        {isAdmin && (
          <Link
            href="/admin"
            className={`px-2 py-1 rounded flex items-center gap-1 ${
              isActive(pathname, ["/admin"]) ? "text-amber-400 bg-slate-900/40" : ""
            }`}
          >
            Admin
          </Link>
        )}
      </div>
    </>
  );
}
