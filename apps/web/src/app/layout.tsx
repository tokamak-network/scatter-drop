import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "scatter-drop",
  description:
    "Self-service multi-tenant airdrop platform gated by zk-X509 national-PKI identity",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
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
