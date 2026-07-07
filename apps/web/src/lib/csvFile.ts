import type { ChangeEvent } from "react";

/**
 * Read the file picked in a CSV `<input type="file">` as text and hand it to
 * `onText`, then clear the input so re-selecting the same file fires the
 * change event again. One home for the FileReader dance shared by the
 * campaign wizard, the list builder, and the operator console's republish
 * flow — an encoding/size fix here reaches every CSV upload.
 */
export function readCsvFileInput(
  e: ChangeEvent<HTMLInputElement>,
  onText: (text: string) => void,
): void {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => onText(String(reader.result ?? ""));
  reader.readAsText(file);
}
