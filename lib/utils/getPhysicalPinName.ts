import type { SourcePort } from "circuit-json"

/** Physical package names remain distinct from numeric schematic layout ordinals. */
export function getPhysicalPinName(
  sourcePort?: SourcePort | null,
  padHints?: readonly string[],
): string | undefined {
  return sourcePort &&
    (sourcePort.pin_number === undefined ||
      padHints?.includes(sourcePort.name)) &&
    /^[A-Z]+[1-9]\d*$/.test(sourcePort.name)
    ? sourcePort.name
    : undefined
}
