/**
 * Trigger a browser download of a CSV string. Extracted so the several callers
 * (tools builder, Dune import, tax reports) share one blob-anchor dance instead
 * of copy-pasting it — including the iOS-Safari-safe deferred revoke.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Append to the DOM and defer revoke so the download isn't canceled (iOS Safari).
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
