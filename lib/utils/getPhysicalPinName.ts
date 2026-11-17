import type { SourcePort } from "circuit-json"

/** Physical package names remain distinct from numeric schematic layout ordinals. */
export function getPhysicalPinName(
  sourcePort?: SourcePort | null,
  padHints?: readonly string[],
): string | undefined {
  if (!sourcePort) return undefined
  const { name, pin_number } = sourcePort
  if (pin_number !== undefined && !padHints?.includes(name)) return undefined
  return /^[A-Z]+[1-9]\d*$/.test(name) ? name : undefined
}
