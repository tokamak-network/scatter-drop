"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useAccount,
  useChains,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { Shield, User } from "lucide-react";
import { useIsAdmin } from "@/lib/contracts";
import { useMounted } from "@/lib/useMounted";

const LINKS = [
  { href: "/campaigns", label: "Explore", match: ["/campaigns", "/c"] },
  { href: "/upcoming", label: "Upcoming", match: ["/upcoming"] },
  { href: "/claim", label: "My Claims", match: ["/claim"] },
  { href: "/manage", label: "Manage", match: ["/manage"] },
  { href: "/tools", label: "Tools", match: ["/tools"] },
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
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const chains = useChains();
  const isAdminWallet = useIsAdmin(address);
  const isAdmin = mounted && isAdminWallet;

  const connected = mounted && isConnected && address;
  const injector = connectors[0];

  // A connected wallet is "on a supported network" when its chain is registered.
  const activeChain = chains.find((c) => c.id === chainId);
  const onSupported = !connected || activeChain !== undefined;
  const chainLabel = activeChain?.name ?? chains[0]?.name ?? "network";

  return (
    <>
      {/* Header */}
      <header className="bg-ink text-white sticky top-0 z-40 px-4 py-4 md:px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 cursor-pointer select-none">
            <div className="w-7 h-7 rounded-lg bg-pop-yellow flex items-center justify-center font-chunk text-ink">
              S
            </div>
            <span className="font-display font-bold text-lg tracking-tight text-white">
              scatter<span className="text-pop-yellow">.drop</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-xs font-mono font-medium text-white/70">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`hover:text-white transition ${
                  isActive(pathname, l.match)
                    ? "text-pop-yellow border-b-2 border-pop-yellow pb-0.5"
                    : ""
                }`}
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/admin"
              title={isAdmin ? "Platform admin" : "Platform admin (owner only)"}
              className={`hover:text-white transition flex items-center gap-1.5 ${
                isActive(pathname, ["/admin"])
                  ? "text-amber-400 border-b-2 border-amber-400 pb-0.5 font-bold"
                  : isAdmin
                    ? "text-amber-400"
                    : "text-white/50"
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-amber-500" /> Admin
            </Link>
          </nav>

          <div className="flex items-center gap-3 font-mono text-xs">
            {/* Network chip — left of the wallet button, reflects the connected chain */}
            {onSupported ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] text-white/70">
                <span
                  className={`w-2 h-2 rounded-full ${connected ? "bg-pop-mint animate-pulse" : "bg-white/40"}`}
                />
                {connected ? "Connected: " : "Target chain: "}
                <strong className="text-white">{chainLabel}</strong>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pop-yellow px-2.5 py-1 text-[11px] text-ink font-semibold">
                Unsupported network.
                {chains[0] && (
                  <button
                    onClick={() => switchChain({ chainId: chains[0]!.id })}
                    className="underline font-bold cursor-pointer"
                  >
                    Switch to {chains[0].name}
                  </button>
                )}
              </span>
            )}
            {connected ? (
              <button
                onClick={() => disconnect()}
                className="bg-white/10 border border-white/20 hover:border-white/50 px-3 py-1.5 rounded-full text-white transition flex items-center gap-2 cursor-pointer"
                title="Click to disconnect"
              >
                <User className="w-3.5 h-3.5 text-white/70" />
                <span>{short(address)}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-pop-mint" />
              </button>
            ) : (
              <button
                onClick={() => injector && connect({ connector: injector })}
                disabled={!injector || isPending}
                className="bg-pop-yellow hover:bg-pop-yellow/85 text-ink font-bold px-4 py-2 rounded-full transition cursor-pointer disabled:opacity-60"
              >
                {isPending ? "Connecting…" : "Connect Wallet"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <div className="md:hidden bg-ink px-4 py-2 flex justify-around gap-2 text-[11px] font-mono font-medium text-white/60">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`px-2 py-1 rounded ${
              isActive(pathname, l.match) ? "text-pop-yellow bg-white/10" : ""
            }`}
          >
            {l.label}
          </Link>
        ))}
        <Link
          href="/admin"
          className={`px-2 py-1 rounded flex items-center gap-1 ${
            isActive(pathname, ["/admin"])
              ? "text-amber-400 bg-white/10"
              : "text-amber-400/80"
          }`}
        >
          Admin
        </Link>
      </div>
    </>
  );
}
