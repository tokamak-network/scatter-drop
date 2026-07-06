import Link from "next/link";
import { inkBtnClass, POP_PANEL } from "@/components/pop";
import {
  ShieldCheck,
  Fingerprint,
  ToggleRight,
  Lock,
  Upload,
  Camera,
  KeyRound,
  Award,
  Coins,
  ListChecks,
  ArrowRight,
} from "lucide-react";

const WHY = [
  {
    icon: ShieldCheck,
    title: "Legally-valid identity",
    body: "Bind claims to national-PKI digital signatures (Korea NPKI, eIDAS) — real legal identity, not just proof-of-personhood.",
  },
  {
    icon: Fingerprint,
    title: "Sybil-resistant",
    body: "One verified identity, one claim. No single actor can split into thousands of wallets to capture a disproportionate share — fair distribution to real recipients.",
  },
  {
    icon: ToggleRight,
    title: "Optional & flexible",
    body: "Require identity for regulated drops, or leave it off for open claims. You choose per campaign — no lock-in.",
  },
  {
    icon: Lock,
    title: "Non-custodial",
    body: "Deposited assets live in the campaign contract. The platform can never withdraw, freeze, or reroute your funds.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Create a campaign",
    body: "Pick an asset from the curated registry, set amounts and a claim window, and choose whether to require identity.",
  },
  {
    n: "02",
    title: "Fund it",
    body: "Deposit into the campaign's non-custodial contract. Set a percent or flat platform fee, per token.",
  },
  {
    n: "03",
    title: "Recipients claim",
    body: "Eligibility is proven on-chain — a Merkle proof plus optional zk-X509 identity — and claimed in a single transaction.",
  },
];

const TYPES = [
  {
    icon: Upload,
    title: "CSV upload",
    body: "Import an allow-list of addresses and amounts for a fixed distribution.",
  },
  {
    icon: Camera,
    title: "On-chain snapshot",
    body: "Reward token or NFT holders captured at a chosen block height.",
  },
  {
    icon: KeyRound,
    title: "Identity-gated",
    body: "Gate claims by a national-PKI identity registry and eligibility rules.",
  },
  {
    icon: Award,
    title: "Social / task",
    body: "Reward completed tasks or social actions with verifiable claims.",
  },
];

const AUDIENCE = [
  "Regulated & RWA token teams",
  "DAO and community rewards",
  "Enterprise dividends & membership",
  "Region-limited campaigns",
  "Projects burned by Sybil farming",
];

export default function HomePage() {
  return (
    <div className="space-y-24 pb-12 animate-fade-in">
      {/* Hero */}
      <section className="text-center pt-10 md:pt-16">
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-pop-mint px-3 py-1 text-[11px] font-mono font-bold text-ink">
          <span className="w-1.5 h-1.5 rounded-full bg-ink" />
          Self-serve distribution tooling · zk-X509 identity
        </span>
        <h1 className="mt-6 font-chunk uppercase text-4xl md:text-6xl leading-[0.95] tracking-tight text-ink">
          One verified identity,
          <br />
          one claim.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base md:text-lg leading-relaxed text-ink/70">
          Tooling for operators who distribute tokens: build the recipient
          list, deploy your own campaign contract, and let recipients claim.
          Every claim ties to one real, verified identity — and the platform
          never holds or hands out your tokens. Non-custodial, open or gated.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link
            href="/campaigns"
            className={`inline-flex items-center gap-2 text-sm ${inkBtnClass("lg")}`}
          >
            Explore campaigns <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/manage/new"
            className="inline-flex items-center gap-2 bg-white border-2 border-ink hover:bg-pop-cream text-ink font-bold px-5 py-2.5 rounded-full text-sm transition"
          >
            Create a campaign
          </Link>
        </div>
      </section>

      {/* Why */}
      <section>
        <SectionHead
          eyebrow="Why scatter.drop"
          title="Distribution you can actually stand behind"
          sub="Anonymous distribution tools can't tell a person from a bot, or prove who received what. scatter.drop can."
        />
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {WHY.map((f) => (
            <div
              key={f.title}
              className={`bg-white p-5 space-y-3 ${POP_PANEL}`}
            >
              <div className="w-10 h-10 rounded-xl bg-pop-mint border-2 border-ink flex items-center justify-center">
                <f.icon className="w-5 h-5 text-ink" />
              </div>
              <h3 className="text-sm font-bold text-ink">{f.title}</h3>
              <p className="text-xs leading-relaxed text-ink/60">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section>
        <SectionHead
          eyebrow="How it works"
          title="Launch in three steps"
          sub="From an idea to a live, claimable campaign — no smart-contract work required."
        />
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className={`relative bg-pop-cream p-6 space-y-3 ${POP_PANEL}`}
            >
              <span className="font-chunk text-2xl text-ink/20">
                {s.n}
              </span>
              <h3 className="text-base font-bold text-ink">
                {s.title}
              </h3>
              <p className="text-sm leading-relaxed text-ink/60">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Distribution types + extras */}
      <section>
        <SectionHead
          eyebrow="Features"
          title="Built for every kind of drop"
          sub="Four distribution types, a curated asset registry, and flexible fees — all in one flow."
        />
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TYPES.map((t) => (
            <div
              key={t.title}
              className={`bg-white p-5 space-y-3 ${POP_PANEL}`}
            >
              <t.icon className="w-5 h-5 text-ink" />
              <h3 className="text-sm font-bold text-ink">{t.title}</h3>
              <p className="text-xs leading-relaxed text-ink/60">{t.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`bg-white p-5 flex items-start gap-4 ${POP_PANEL}`}>
            <div className="w-10 h-10 shrink-0 rounded-xl bg-pop-sky border-2 border-ink flex items-center justify-center">
              <ListChecks className="w-5 h-5 text-ink" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-ink">
                Curated asset registry
              </h3>
              <p className="text-xs leading-relaxed text-ink/60">
                Campaigns draw from an admin-vetted list of established assets,
                keeping impersonation and malicious tokens off the platform.
              </p>
            </div>
          </div>
          <div className={`bg-white p-5 flex items-start gap-4 ${POP_PANEL}`}>
            <div className="w-10 h-10 shrink-0 rounded-xl bg-pop-yellow border-2 border-ink flex items-center justify-center">
              <Coins className="w-5 h-5 text-ink" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-ink">
                Flexible fees
              </h3>
              <p className="text-xs leading-relaxed text-ink/60">
                Charge a percentage or a flat fee, configurable per token — paid
                on top of the distribution, never skimmed from recipients.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section>
        <SectionHead
          eyebrow="Who it's for"
          title="When distribution has to be provable"
          sub="If real identity, jurisdiction, or Sybil-resistance matter, this is your toolkit."
        />
        <div className="mt-8 flex flex-wrap gap-2.5">
          {AUDIENCE.map((a) => (
            <span
              key={a}
              className="rounded-full border-2 border-ink/20 bg-white px-4 py-2 text-sm font-semibold text-ink/70"
            >
              {a}
            </span>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-3xl border-2 border-ink bg-pop-mint pop-shadow px-6 py-12 text-center">
        <h2 className="font-chunk uppercase text-2xl md:text-3xl tracking-tight text-ink">
          Ready to launch your drop?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-ink/70">
          Explore live campaigns to see it in action, or spin up your own in
          minutes — your campaign, your contract, your tokens.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Link
            href="/campaigns"
            className={`inline-flex items-center gap-2 text-sm ${inkBtnClass("lg")}`}
          >
            Explore campaigns <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/manage/new"
            className="inline-flex items-center gap-2 bg-white border-2 border-ink hover:bg-pop-cream text-ink font-bold px-5 py-2.5 rounded-full text-sm transition"
          >
            Create a campaign
          </Link>
        </div>
      </section>
    </div>
  );
}

function SectionHead({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="max-w-2xl">
      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-ink/50">
        {eyebrow}
      </span>
      <h2 className="mt-2 font-chunk uppercase text-2xl md:text-3xl tracking-tight text-ink">
        {title}
      </h2>
      <p className="mt-3 text-sm md:text-base leading-relaxed text-ink/60">
        {sub}
      </p>
    </div>
  );
}
