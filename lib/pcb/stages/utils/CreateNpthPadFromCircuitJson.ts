import { FootprintPad, PadDrill } from "kicadts"
import type { PcbHole } from "circuit-json"
import { applyToPoint, rotate, identity } from "transformation-matrix"

const DEFAULT_NPTH_DIAMETER = 1.0

const getFinitePositiveDimension = (
  value: unknown,
  fallback = DEFAULT_NPTH_DIAMETER,
): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback

export function createNpthPadFromCircuitJson({
  pcbHole,
  componentCenter,
  componentRotation = 0,
}: {
  pcbHole: PcbHole
  componentCenter: { x: number; y: number }
  componentRotation?: number
}): FootprintPad | null {
  if (!("x" in pcbHole && "y" in pcbHole)) {
    return null
  }

  const relativeX = pcbHole.x - componentCenter.x
  const relativeY = -(pcbHole.y - componentCenter.y)

  // Apply component rotation to hole position using transformation matrix
  const rotationMatrix =
    componentRotation !== 0
      ? rotate((componentRotation * Math.PI) / 180)
      : identity()

  const rotatedPos = applyToPoint(rotationMatrix, {
    x: relativeX,
    y: relativeY,
  })

  // Determine pad shape based on hole shape
  let padShape: "circle" | "oval" | "rect" = "circle"
  let padSize: [number, number]
  let drill: PadDrill
  let rotation = 0

  if (pcbHole.hole_shape === "circle") {
    // Circular non-plated hole
    padShape = "circle"
    const diameter = getFinitePositiveDimension(pcbHole.hole_diameter)
    padSize = [diameter, diameter]
    drill = new PadDrill({
      diameter: diameter,
    })
  } else if (pcbHole.hole_shape === "oval" || pcbHole.hole_shape === "pill") {
    // Oval or Pill-shaped non-plated hole
    padShape = "oval"
    const width = getFinitePositiveDimension(pcbHole.hole_width)
    const height = getFinitePositiveDimension(pcbHole.hole_height)
    padSize = [width, height]
    drill = new PadDrill({
      oval: true,
      diameter: width,
      width: height,
    })
  } else if (pcbHole.hole_shape === "rotated_pill") {
    // Rotated pill-shaped non-plated hole
    padShape = "oval"
    const width = getFinitePositiveDimension(pcbHole.hole_width)
    const height = getFinitePositiveDimension(pcbHole.hole_height)
    padSize = [width, height]
    drill = new PadDrill({
      oval: true,
      diameter: width,
      width: height,
    })
    rotation = Number.isFinite(pcbHole.ccw_rotation) ? pcbHole.ccw_rotation : 0
  } else {
    // Default fallback for unknown shapes
    padShape = "circle"
    const diameter =
      "hole_diameter" in pcbHole
        ? getFinitePositiveDimension(pcbHole.hole_diameter)
        : DEFAULT_NPTH_DIAMETER
    padSize = [diameter, diameter]
    drill = new PadDrill({ diameter: diameter })
  }

  return new FootprintPad({
    number: "", // Non-plated holes have no pad number
    padType: "np_thru_hole",
    shape: padShape,
    at: [rotatedPos.x, rotatedPos.y, rotation],
    size: padSize,
    drill: drill,
    layers: ["*.Cu", "*.Mask"],
    removeUnusedLayers: false,
    uuid: crypto.randomUUID(),
  })
}
