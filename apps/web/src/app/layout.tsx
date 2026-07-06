import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { getPublicNetworks } from "@/lib/server/networks";

export const metadata: Metadata = {
  title: "scatter-drop",
  description:
    "Self-serve token distribution tooling gated by zk-X509 national-PKI identity — operators create, fund, and run their own claim campaigns",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Build the wallet config from the admin network registry (falls back to the
  // env fork chain when the DB is empty/unavailable).
  const networks = await getPublicNetworks();
  return (
    <html lang="en">
      <body>
        <Providers networks={networks}>
          <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
            <Nav />
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 md:px-8 space-y-8 pb-32">
              {children}
            </main>
            {/* Utility positioning: the platform is tooling, never the party
                distributing tokens — campaigns belong to their operators. */}
            <footer className="border-t-2 border-ink/10 px-4 py-6 md:px-8">
              <p className="max-w-7xl mx-auto text-[11px] font-mono text-ink/40 leading-relaxed">
                scatter.drop is self-serve distribution tooling. Every campaign
                is created, funded, and operated by its operator; deposited
                assets live in the campaign&apos;s own non-custodial contract.
              </p>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
