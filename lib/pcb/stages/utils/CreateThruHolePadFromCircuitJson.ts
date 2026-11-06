import { FootprintPad, PadDrill, PadNet } from "kicadts"
import type { PcbPlatedHole } from "circuit-json"
import { applyToPoint, rotate, identity } from "transformation-matrix"
import type { PcbNetInfo } from "../../../types"
import { generateDeterministicUuid } from "./generateDeterministicUuid"

const DEFAULT_PLATED_HOLE_DIAMETER = 0.8
const DEFAULT_PLATED_OUTER_DIAMETER = 1.6

const getFinitePositiveDimension = (
  value: unknown,
  fallback: number,
): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback

const getFiniteNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

export function createThruHolePadFromCircuitJson({
  platedHole,
  componentCenter,
  padNumber,
  componentRotation = 0,
  netInfo,
  componentId,
}: {
  platedHole: PcbPlatedHole
  componentCenter: { x: number; y: number }
  padNumber: number | string
  componentRotation?: number
  netInfo?: PcbNetInfo
  componentId?: string
}): FootprintPad | null {
  if (!("x" in platedHole && "y" in platedHole)) {
    return null
  }

  const relativeX = platedHole.x - componentCenter.x
  const relativeY = -(platedHole.y - componentCenter.y)

  // Apply component rotation to pad position using transformation matrix
  const rotationMatrix =
    componentRotation !== 0
      ? rotate((componentRotation * Math.PI) / 180)
      : identity()

  const rotatedPos = applyToPoint(rotationMatrix, {
    x: relativeX,
    y: relativeY,
  })

  // Determine pad shape based on plated hole shape
  let padShape: "circle" | "oval" | "rect" = "circle"
  let padSize: [number, number]
  let drill: PadDrill
  let rotation = 0

  const hasHoleOffset =
    "hole_offset_x" in platedHole || "hole_offset_y" in platedHole

  let drillOffset: { x: number; y: number } | undefined

  if (hasHoleOffset) {
    const rawOffset = {
      x: getFiniteNumber(platedHole.hole_offset_x, 0),
      y: getFiniteNumber(platedHole.hole_offset_y, 0),
    }

    if (rawOffset.x !== 0 || rawOffset.y !== 0) {
      // KiCad's drill offset convention: positive X moves drill LEFT (inverted from normal)
      // Y offset is relative to the pad which is already in KiCad's Y-down coordinate system
      const rotatedOffset = applyToPoint(rotationMatrix, {
        x: -rawOffset.x,
        y: rawOffset.y,
      })

      drillOffset = rotatedOffset
    }
  }

  if (platedHole.shape === "circle") {
    // Circular plated hole
    padShape = "circle"
    const holeDiameter = getFinitePositiveDimension(
      platedHole.hole_diameter,
      DEFAULT_PLATED_HOLE_DIAMETER,
    )
    const outerDiameter = getFinitePositiveDimension(
      platedHole.outer_diameter,
      Math.max(DEFAULT_PLATED_OUTER_DIAMETER, holeDiameter),
    )
    padSize = [outerDiameter, outerDiameter]
    drill = new PadDrill({
      diameter: holeDiameter,
      offset: drillOffset,
    })
  } else if (platedHole.shape === "pill" || platedHole.shape === "oval") {
    // Pill-shaped plated hole (oval)
    padShape = "oval"
    rotation = getFiniteNumber(platedHole.ccw_rotation, 0)
    const holeWidth = getFinitePositiveDimension(
      platedHole.hole_width,
      DEFAULT_PLATED_HOLE_DIAMETER,
    )
    const holeHeight = getFinitePositiveDimension(
      platedHole.hole_height,
      DEFAULT_PLATED_HOLE_DIAMETER,
    )
    const outerWidth = getFinitePositiveDimension(
      platedHole.outer_width,
      Math.max(DEFAULT_PLATED_OUTER_DIAMETER, holeWidth),
    )
    const outerHeight = getFinitePositiveDimension(
      platedHole.outer_height,
      Math.max(DEFAULT_PLATED_OUTER_DIAMETER, holeHeight),
    )
    padSize = [outerWidth, outerHeight]
    drill = new PadDrill({
      oval: true,
      diameter: holeWidth,
      width: holeHeight,
      offset: drillOffset,
    })
  } else if (platedHole.shape === "pill_hole_with_rect_pad") {
    // Pill hole with rectangular pad
    padShape = "rect"
    const holeWidth = getFinitePositiveDimension(
      platedHole.hole_width,
      DEFAULT_PLATED_HOLE_DIAMETER,
    )
    const holeHeight = getFinitePositiveDimension(
      platedHole.hole_height,
      DEFAULT_PLATED_HOLE_DIAMETER,
    )
    const rectPadWidth = getFinitePositiveDimension(
      platedHole.rect_pad_width,
      Math.max(DEFAULT_PLATED_OUTER_DIAMETER, holeWidth),
    )
    const rectPadHeight = getFinitePositiveDimension(
      platedHole.rect_pad_height,
      Math.max(DEFAULT_PLATED_OUTER_DIAMETER, holeHeight),
    )
    padSize = [rectPadWidth, rectPadHeight]
    drill = new PadDrill({
      oval: true,
      diameter: holeWidth,
      width: holeHeight,
      offset: drillOffset,
    })
  } else if (platedHole.shape === "circular_hole_with_rect_pad") {
    // Circular hole with rectangular pad
    padShape = "rect"
    const holeDiameter = getFinitePositiveDimension(
      platedHole.hole_diameter,
      DEFAULT_PLATED_HOLE_DIAMETER,
    )
    const rectPadWidth = getFinitePositiveDimension(
      platedHole.rect_pad_width,
      Math.max(DEFAULT_PLATED_OUTER_DIAMETER, holeDiameter),
    )
    const rectPadHeight = getFinitePositiveDimension(
      platedHole.rect_pad_height,
      Math.max(DEFAULT_PLATED_OUTER_DIAMETER, holeDiameter),
    )
    padSize = [rectPadWidth, rectPadHeight]
    drill = new PadDrill({
      diameter: holeDiameter,
      offset: drillOffset,
    })
    rotation = getFiniteNumber(platedHole.rect_ccw_rotation, 0)
  } else if (platedHole.shape === "rotated_pill_hole_with_rect_pad") {
    // Rotated pill hole with rectangular pad
    padShape = "rect"
    const holeWidth = getFinitePositiveDimension(
      platedHole.hole_width,
      DEFAULT_PLATED_HOLE_DIAMETER,
    )
    const holeHeight = getFinitePositiveDimension(
      platedHole.hole_height,
      DEFAULT_PLATED_HOLE_DIAMETER,
    )
    const rectPadWidth = getFinitePositiveDimension(
      platedHole.rect_pad_width,
      Math.max(DEFAULT_PLATED_OUTER_DIAMETER, holeWidth),
    )
    const rectPadHeight = getFinitePositiveDimension(
      platedHole.rect_pad_height,
      Math.max(DEFAULT_PLATED_OUTER_DIAMETER, holeHeight),
    )
    padSize = [rectPadWidth, rectPadHeight]
    drill = new PadDrill({
      oval: true,
      diameter: holeWidth,
      width: holeHeight,
      offset: drillOffset,
    })
    rotation = getFiniteNumber(platedHole.rect_ccw_rotation, 0)
  } else {
    // Default fallback
    padShape = "circle"
    padSize = [DEFAULT_PLATED_OUTER_DIAMETER, DEFAULT_PLATED_OUTER_DIAMETER]
    drill = new PadDrill({
      diameter: DEFAULT_PLATED_HOLE_DIAMETER,
      offset: drillOffset,
    })
  }

  // Generate deterministic UUID for pad
  const padData = `thruhole:${componentId}:${padNumber}:${rotatedPos.x},${rotatedPos.y}`
  const pad = new FootprintPad({
    number: String(padNumber),
    padType: "thru_hole",
    shape: padShape,
    at: [rotatedPos.x, rotatedPos.y, rotation],
    size: padSize,
    drill: drill,
    layers: ["*.Cu", "*.Mask"],
    removeUnusedLayers: false,
    uuid: generateDeterministicUuid(padData),
  })

  if (netInfo) {
    pad.net = new PadNet(netInfo.id, netInfo.name)
  }

  return pad
}
