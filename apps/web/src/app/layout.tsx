import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { getPublicNetworks } from "@/lib/server/networks";

export const metadata: Metadata = {
  title: "scatter-drop",
  description:
    "Self-service multi-tenant airdrop platform gated by zk-X509 national-PKI identity",
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
          </div>
        </Providers>
      </body>
    </html>
  );
}
