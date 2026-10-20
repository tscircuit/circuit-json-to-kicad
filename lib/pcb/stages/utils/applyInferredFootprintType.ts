import { Footprint, FootprintAttr } from "kicadts"

export function applyInferredFootprintType(footprint: Footprint): void {
  if (footprint.attr?.type) return

  let type: "through_hole" | "smd" | undefined
  if (footprint.fpPads.some((pad) => pad.padType === "thru_hole")) {
    type = "through_hole"
  } else if (footprint.fpPads.some((pad) => pad.padType === "smd")) {
    type = "smd"
  }

  if (type) {
    footprint.attr ??= new FootprintAttr()
    footprint.attr.type = type
  }
}
