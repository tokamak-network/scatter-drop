import type { Address, Hex } from "viem";

/**
 * Renders a prepared (but unsent) transaction request. In the W6.1 scaffold the
 * UI builds calldata with the SDK and shows it here instead of sending — the
 * wallet send is wired in M5/M6 once contracts are deployed.
 */
export function CalldataPreview({
  title,
  to,
  data,
  note,
}: {
  title: string;
  to: Address;
  data: Hex;
  note?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3)",
        background: "var(--color-surface-2)",
      }}
    >
      <div style={{ fontSize: 13, marginBottom: 6 }}>{title}</div>
      <pre
        style={{
          margin: 0,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          color: "var(--color-text-muted)",
        }}
      >
        to:   {to}
        {"\n"}data: {data}
      </pre>
      {note && (
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          {note}
        </div>
      )}
    </div>
  );
}
