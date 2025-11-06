import type { PcbSmtPad } from "circuit-json"
import {
  FootprintPad,
  PadPrimitives,
  PadPrimitiveGrPoly,
  Pts,
  Xy,
  PadOptions,
} from "kicadts"
import { applyToPoint, rotate, identity } from "transformation-matrix"
/**
 * Creates a KiCad footprint pad from a circuit JSON SMT pad
 */
export function createSmdPadFromCircuitJson({
  pcbPad,
  componentCenter,
  padNumber,
  componentRotation = 0,
}: {
  pcbPad: PcbSmtPad
  componentCenter: { x: number; y: number }
  padNumber: number
  componentRotation?: number
}): FootprintPad {
  // For polygon pads, calculate the center from the points
  let padX: number
  let padY: number

  if ("x" in pcbPad && "y" in pcbPad) {
    padX = pcbPad.x
    padY = pcbPad.y
  } else if ("points" in pcbPad && Array.isArray(pcbPad.points)) {
    // Calculate centroid of polygon
    const points = pcbPad.points as Array<{ x: number; y: number }>
    padX = points.reduce((sum, p) => sum + p.x, 0) / points.length
    padY = points.reduce((sum, p) => sum + p.y, 0) / points.length
  } else {
    throw new Error("Pad must have either x/y coordinates or points array")
  }

  // Calculate pad position relative to component center
  const relativeX = padX - componentCenter.x
  const relativeY = -(padY - componentCenter.y)

  // Apply component rotation to pad position using transformation matrix
  const rotationMatrix =
    componentRotation !== 0
      ? rotate((componentRotation * Math.PI) / 180)
      : identity()

  const rotatedPos = applyToPoint(rotationMatrix, {
    x: relativeX,
    y: relativeY,
  })

  // Map layer names
  const layerMap: Record<string, string> = {
    top: "F.Cu",
    bottom: "B.Cu",
  }
  const padLayer = layerMap[pcbPad.layer] || "F.Cu"

  // Handle different pad shapes (circle pads have radius, rect pads have width/height, polygon pads use custom shape)
  let padShape: string
  let padSize: [number, number]
  let padOptions: PadOptions | undefined
  let padPrimitives: PadPrimitives | undefined

  if (pcbPad.shape === "circle") {
    padShape = "circle"
    padSize = [
      "radius" in pcbPad ? pcbPad.radius * 2 : 0.5,
      "radius" in pcbPad ? pcbPad.radius * 2 : 0.5,
    ]
  } else if (pcbPad.shape === "polygon" && "points" in pcbPad) {
    // For polygon pads, use custom shape with primitives
    const points = pcbPad.points as Array<{ x: number; y: number }>

    // Convert points from absolute coordinates to relative coordinates
    // (relative to the pad center which is at padX, padY)
    const relativePoints = points.map((p) => {
      const relX = p.x - padX
      const relY = -(p.y - padY) // Flip Y coordinate for KiCad
      return new Xy(relX, relY)
    })

    // Create the polygon primitive
    const grPoly = new PadPrimitiveGrPoly()
    grPoly.contours = [new Pts(relativePoints)]
    grPoly.width = 0
    grPoly.filled = true

    // Set up the primitives container
    padPrimitives = new PadPrimitives()
    padPrimitives.addGraphic(grPoly)

    // Use custom shape with a circle anchor
    padShape = "custom"
    padOptions = new PadOptions()
    padOptions.anchor = "circle"

    // Set a small anchor size (the anchor is just for the pad number)
    padSize = [0.2, 0.2]
  } else {
    padShape = "rect"
    padSize = [
      "width" in pcbPad ? pcbPad.width : 0.5,
      "height" in pcbPad ? pcbPad.height : 0.5,
    ]
  }

  const pad = new FootprintPad({
    number: String(padNumber),
    padType: "smd",
    shape: padShape,
    at: [rotatedPos.x, rotatedPos.y, 0],
    size: padSize,
    layers: [
      `${padLayer}`,
      `${padLayer === "F.Cu" ? "F" : "B"}.Paste`,
      `${padLayer === "F.Cu" ? "F" : "B"}.Mask`,
    ],
    uuid: crypto.randomUUID(),
  })

  // Add custom pad options and primitives if this is a polygon pad
  if (padOptions) {
    pad.options = padOptions
  }
  if (padPrimitives) {
    pad.primitives = padPrimitives
  }

  return pad
}
