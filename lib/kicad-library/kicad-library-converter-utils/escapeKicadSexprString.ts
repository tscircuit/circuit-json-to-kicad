export function escapeKicadSexprString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}
