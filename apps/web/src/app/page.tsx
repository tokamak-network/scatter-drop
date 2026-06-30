import Link from "next/link";

export default function HomePage() {
  return (
    <section style={{ textAlign: "center", padding: "64px 0" }}>
      <h1 style={{ fontSize: 40, margin: "0 0 12px", letterSpacing: -1 }}>
        Compliant token distribution,
        <br />
        gated by real identity.
      </h1>
      <p
        className="muted"
        style={{ fontSize: 18, maxWidth: 640, margin: "0 auto 32px" }}
      >
        Anyone can launch an airdrop. Every campaign is gated by zk-X509
        national-PKI identity verification — legally valid, Sybil-resistant
        distribution.
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <Link className="btn btn-primary" href="/campaigns">
          Explore campaigns
        </Link>
        <Link className="btn" href="/manage/new">
          Create a campaign
        </Link>
      </div>
    </section>
  );
}
