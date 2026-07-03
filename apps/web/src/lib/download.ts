/**
 * Trigger a browser download of a text file. Extracted so the several callers
 * (tools builder, Dune import, tax reports, calendar export) share one
 * blob-anchor dance instead of copy-pasting it — including the
 * iOS-Safari-safe deferred revoke.
 */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
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

export function downloadCsv(filename: string, csv: string): void {
  downloadFile(filename, csv, "text/csv;charset=utf-8");
}
