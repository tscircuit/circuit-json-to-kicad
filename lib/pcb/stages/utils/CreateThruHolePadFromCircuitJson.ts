import { FootprintPad, PadDrill } from "kicadts"
import type { PcbPlatedHole } from "circuit-json"

export function createThruHolePadFromCircuitJson({
  platedHole,
  componentCenter,
  padNumber,
}: {
  platedHole: PcbPlatedHole
  componentCenter: { x: number; y: number }
  padNumber: number
}): FootprintPad | null {
  if (!("x" in platedHole && "y" in platedHole)) {
    return null
  }

  // Calculate pad position relative to component center
  const relativeX = platedHole.x - componentCenter.x
  const relativeY = platedHole.y - componentCenter.y

  // Determine pad shape based on plated hole shape
  let padShape: "circle" | "oval" | "rect" = "circle"
  let padSize: [number, number]
  let drill: PadDrill
  let rotation = 0

  if (platedHole.shape === "circle") {
    // Circular plated hole
    padShape = "circle"
    padSize = [platedHole.outer_diameter, platedHole.outer_diameter]
    drill = new PadDrill({
      diameter: platedHole.hole_diameter,
    })
  } else if (platedHole.shape === "pill" || platedHole.shape === "oval") {
    // Pill-shaped plated hole (oval)
    padShape = "oval"
    padSize = [
      (platedHole as any).outer_width,
      (platedHole as any).outer_height,
    ]
    drill = new PadDrill({
      oval: true,
      diameter: platedHole.hole_width,
      width: platedHole.hole_height,
    })
  } else if (platedHole.shape === "pill_hole_with_rect_pad") {
    // Pill hole with rectangular pad
    padShape = "rect"
    padSize = [
      (platedHole as any).rect_pad_width,
      (platedHole as any).rect_pad_height,
    ]
    drill = new PadDrill({
      oval: true,
      diameter: platedHole.hole_width,
      width: platedHole.hole_height,
    })
  } else if (platedHole.shape === "circular_hole_with_rect_pad") {
    // Circular hole with rectangular pad
    padShape = "rect"
    padSize = [
      (platedHole as any).rect_pad_width,
      (platedHole as any).rect_pad_height,
    ]
    drill = new PadDrill({
      diameter: platedHole.hole_diameter,
    })
  } else if (platedHole.shape === "rotated_pill_hole_with_rect_pad") {
    // Rotated pill hole with rectangular pad
    padShape = "rect"
    padSize = [
      (platedHole as any).rect_pad_width,
      (platedHole as any).rect_pad_height,
    ]
    drill = new PadDrill({
      oval: true,
      diameter: platedHole.hole_width,
      width: platedHole.hole_height,
    })
    rotation = (platedHole as any).rect_ccw_rotation || 0
  } else {
    // Default fallback
    padShape = "circle"
    padSize = [1.6, 1.6]
    drill = new PadDrill({ diameter: 0.8 })
  }

  return new FootprintPad({
    number: String(padNumber),
    padType: "thru_hole",
    shape: padShape,
    at: [relativeX, relativeY, rotation],
    size: padSize,
    drill: drill,
    layers: ["*.Cu", "*.Mask"],
    removeUnusedLayers: false,
    uuid: crypto.randomUUID(),
  })
}
