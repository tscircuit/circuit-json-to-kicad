/** Escape the contents of a quoted KiCad S-expression string. */
export function escapeKicadString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
}
