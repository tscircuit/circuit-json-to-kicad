import { FootprintPad, PadDrill, PadNet } from "kicadts"
import type { PcbPlatedHole } from "circuit-json"
import { applyToPoint, rotate, identity } from "transformation-matrix"
import type { PcbNetInfo } from "../../../types"
import { generateDeterministicUuid } from "./generateDeterministicUuid"

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
  padNumber: number
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
      x: (platedHole as any).hole_offset_x ?? 0,
      y: (platedHole as any).hole_offset_y ?? 0,
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
    padSize = [platedHole.outer_diameter, platedHole.outer_diameter]
    drill = new PadDrill({
      diameter: platedHole.hole_diameter,
      offset: drillOffset,
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
      offset: drillOffset,
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
      offset: drillOffset,
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
      offset: drillOffset,
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
      offset: drillOffset,
    })
    rotation = (platedHole as any).rect_ccw_rotation || 0
  } else {
    // Default fallback
    padShape = "circle"
    padSize = [1.6, 1.6]
    drill = new PadDrill({ diameter: 0.8, offset: drillOffset })
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
