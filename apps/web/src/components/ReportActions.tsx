"use client";

/**
 * Tax-document actions: download the document as CSV (Blob) and "Save as PDF"
 * via the browser print dialog (no PDF dependency). Hidden when printing
 * (`.no-print`) so the buttons do not appear in the saved document.
 */
export function ReportActions({
  csv,
  filename,
  csvLabel = "Download CSV",
}: {
  csv: string;
  filename: string;
  csvLabel?: string;
}) {
  function downloadCsv() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    // Defer revoke so the download starts reliably across browsers
    // (synchronous revoke can cancel it in iOS Safari / older browsers).
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  return (
    <div className="no-print" style={{ display: "flex", gap: 8 }}>
      <button className="btn" onClick={downloadCsv}>
        {csvLabel}
      </button>
      <button className="btn btn-primary" onClick={() => window.print()}>
        Save as PDF
      </button>
    </div>
  );
}
