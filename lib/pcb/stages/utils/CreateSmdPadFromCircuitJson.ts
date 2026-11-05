import type { PcbSmtPad, Point } from "circuit-json"
import { FootprintPad, PadNet, PadOptions, type PadPrimitives } from "kicadts"
import {
  applyToPoint,
  compose,
  rotate,
  scale,
  translate,
} from "transformation-matrix"
import type { PcbNetInfo } from "../../../types"
import {
  createEllipseContour,
  createFilledPolygonPrimitives,
  getSafePolygonAnchor,
} from "./custom-pad-geometry"
import { generateDeterministicUuid } from "./generateDeterministicUuid"
import { getKicadNativePadGeometry } from "./getKicadNativePadGeometry"

/**
 * Creates a KiCad footprint pad from a circuit JSON SMT pad
 */
export function createSmdPadFromCircuitJson({
  pcbPad,
  componentCenter,
  padNumber,
  componentRotation = 0,
  netInfo,
  componentId,
}: {
  pcbPad: PcbSmtPad
  componentCenter: { x: number; y: number }
  padNumber: number | string
  componentRotation?: number
  netInfo?: PcbNetInfo
  componentId?: string
}): FootprintPad {
  const polygonHoles = (pcbPad as PcbSmtPad & { holes?: Point[][] }).holes
  const polygonAnchor =
    pcbPad.shape === "polygon"
      ? getSafePolygonAnchor(pcbPad.points, polygonHoles)
      : undefined

  // For polygon pads, use the safe interior anchor center
  let padX: number
  let padY: number

  if (polygonAnchor) {
    padX = polygonAnchor.center.x
    padY = polygonAnchor.center.y
  } else if ("x" in pcbPad && "y" in pcbPad) {
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

  const cj2kicadMatrix = compose(
    componentRotation !== 0
      ? rotate((componentRotation * Math.PI) / 180)
      : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    scale(1, -1), // Flip Y-axis
    translate(-componentCenter.x, -componentCenter.y),
  )

  const rotatedPos = applyToPoint(cj2kicadMatrix, {
    x: padX,
    y: padY,
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
  let roundrect_rratio: number | undefined
  let rotation = 0

  if (pcbPad.shape === "polygon") {
    if (!polygonAnchor) {
      throw new Error("Polygon pad is missing its anchor geometry")
    }
    const contours = polygonHoles?.length
      ? polygonAnchor.triangles
      : [pcbPad.points]
    padPrimitives = createFilledPolygonPrimitives({
      contours,
      center: { x: padX, y: padY },
    })

    // Use custom shape with a safe interior circle anchor
    padShape = "custom"
    padOptions = new PadOptions()
    padOptions.anchor = "circle"
    padSize = [polygonAnchor.diameter, polygonAnchor.diameter]
  } else if ((pcbPad as { shape: string }).shape === "oval") {
    const ovalPad = pcbPad as unknown as {
      width: number
      height: number
    }
    padShape = "custom"
    padSize = [
      Math.min(0.001, ovalPad.width, ovalPad.height),
      Math.min(0.001, ovalPad.width, ovalPad.height),
    ]
    padOptions = new PadOptions()
    padOptions.anchor = "circle"
    padPrimitives = createFilledPolygonPrimitives({
      contours: [
        createEllipseContour({
          center: { x: padX, y: padY },
          width: ovalPad.width,
          height: ovalPad.height,
        }),
      ],
      center: { x: padX, y: padY },
    })
  } else {
    const geometry = getKicadNativePadGeometry(pcbPad)
    padShape = geometry.shape
    padSize = geometry.size
    rotation = geometry.rotation
    roundrect_rratio = geometry.roundrectRatio
  }

  // Generate deterministic UUID for pad
  const padData = `pad:${componentId}:${padNumber}:${rotatedPos.x},${rotatedPos.y}`
  const pad = new FootprintPad({
    number: String(padNumber),
    padType: "smd",
    shape: padShape,
    at: [rotatedPos.x, rotatedPos.y, rotation],
    size: padSize,
    layers: [
      `${padLayer}`,
      ...(pcbPad.is_covered_with_solder_mask
        ? []
        : [`${padLayer === "F.Cu" ? "F" : "B"}.Mask`]),
    ],
    solderMaskMargin: pcbPad.soldermask_margin,
    roundrectRatio: roundrect_rratio,
    uuid: generateDeterministicUuid(padData),
  })

  // Add custom pad options and primitives if this is a polygon pad
  if (padOptions) {
    pad.options = padOptions
  }
  if (padPrimitives) {
    pad.primitives = padPrimitives
  }

  if (netInfo) {
    pad.net = new PadNet(netInfo.id, netInfo.name)
  }

  return pad
}
