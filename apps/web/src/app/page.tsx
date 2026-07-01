import Link from "next/link";

export default function HomePage() {
  return (
    <section style={{ textAlign: "center", padding: "64px 0" }}>
      <h1 style={{ fontSize: 40, margin: "0 0 12px", letterSpacing: -1 }}>
        Airdrops,
        <br />
        with identity when you need it.
      </h1>
      <p
        className="muted"
        style={{ fontSize: 18, maxWidth: 640, margin: "0 auto 32px" }}
      >
        Anyone can launch a campaign from a curated asset registry. Turn on
        optional zk-X509 national-PKI identity gating for legally valid,
        Sybil-resistant distribution — or leave it off for open claims.
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
