import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { NetworkBanner } from "@/components/NetworkBanner";

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
          <Nav />
          <NetworkBanner />
          <main className="container" style={{ padding: "32px 24px 64px" }}>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
