import { FootprintAttr, type Footprint } from "kicadts"

export function setFootprintTypeFromPads(footprint: Footprint): void {
  if (footprint.attr?.type) return

  const padTypes = footprint.fpPads.map((pad) => pad.padType)
  const type = padTypes.includes("thru_hole")
    ? "through_hole"
    : padTypes.includes("smd")
      ? "smd"
      : undefined

  if (!type) return

  footprint.attr ??= new FootprintAttr()
  footprint.attr.type = type
}
