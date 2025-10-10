import { FootprintPad, PadDrill } from "kicadts"
import type { PcbHole } from "circuit-json"

export function createNpthPadFromCircuitJson({
  pcbHole,
  componentCenter,
}: {
  pcbHole: PcbHole
  componentCenter: { x: number; y: number }
}): FootprintPad | null {
  if (!("x" in pcbHole && "y" in pcbHole)) {
    return null
  }

  const relativeX = pcbHole.x - componentCenter.x
  const relativeY = -(pcbHole.y - componentCenter.y)

  // Determine pad shape based on hole shape
  let padShape: "circle" | "oval" | "rect" = "circle"
  let padSize: [number, number]
  let drill: PadDrill

  if (pcbHole.hole_shape === "circle") {
    // Circular non-plated hole
    padShape = "circle"
    const diameter = pcbHole.hole_diameter
    padSize = [diameter, diameter]
    drill = new PadDrill({
      diameter: diameter,
    })
  } else if (pcbHole.hole_shape === "oval") {
    // Oval non-plated hole
    padShape = "oval"
    const width = pcbHole.hole_width
    const height = pcbHole.hole_height
    padSize = [width, height]
    drill = new PadDrill({
      oval: true,
      diameter: width,
      width: height,
    })
  } else {
    // Default fallback for unknown shapes
    padShape = "circle"
    const diameter = pcbHole.hole_diameter || 1.0
    padSize = [diameter, diameter]
    drill = new PadDrill({ diameter: diameter })
  }

  return new FootprintPad({
    number: "", // Non-plated holes have no pad number
    padType: "np_thru_hole",
    shape: padShape,
    at: [relativeX, relativeY, 0],
    size: padSize,
    drill: drill,
    layers: ["*.Cu", "*.Mask"],
    removeUnusedLayers: false,
    uuid: crypto.randomUUID(),
  })
}
