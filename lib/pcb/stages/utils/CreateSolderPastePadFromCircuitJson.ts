import type { PcbSolderPaste, Point } from "circuit-json"
import { FootprintPad, PadOptions } from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { getBoardToFootprintTransform } from "../footprints-stage-converters/get-board-to-footprint-transform"
import {
  createEllipseContour,
  createFilledPolygonPrimitives,
  getSafePolygonAnchor,
} from "./custom-pad-geometry"
import { generateDeterministicUuid } from "./generateDeterministicUuid"
import { getKicadNativePadGeometry } from "./getKicadNativePadGeometry"

export const getSolderPasteCenter = (solderPaste: PcbSolderPaste): Point => {
  if (
    "x" in solderPaste &&
    "y" in solderPaste &&
    typeof solderPaste.x === "number" &&
    typeof solderPaste.y === "number" &&
    Number.isFinite(solderPaste.x) &&
    Number.isFinite(solderPaste.y)
  ) {
    return { x: solderPaste.x, y: solderPaste.y }
  }

  if ("points" in solderPaste && Array.isArray(solderPaste.points)) {
    const validPoints = solderPaste.points.filter(
      (point: Point) =>
        point != null &&
        typeof point.x === "number" &&
        typeof point.y === "number" &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y),
    )

    return {
      x:
        validPoints.reduce((sum: number, point: Point) => sum + point.x, 0) /
        validPoints.length,
      y:
        validPoints.reduce((sum: number, point: Point) => sum + point.y, 0) /
        validPoints.length,
    }
  }

  throw new Error(
    "Solder paste must have either finite x/y coordinates or points array",
  )
}

/** Creates an unnumbered, paste-only KiCad pad from an explicit aperture. */
export const createSolderPastePadFromCircuitJson = ({
  solderPaste,
  componentCenter,
  componentRotation = 0,
}: {
  solderPaste: PcbSolderPaste
  componentCenter: Point
  componentRotation?: number
}): FootprintPad => {
  const polygonAnchor =
    solderPaste.shape === "polygon"
      ? getSafePolygonAnchor(solderPaste.points, solderPaste.holes)
      : undefined
  const center = polygonAnchor?.center ?? getSolderPasteCenter(solderPaste)
  const boardToFootprint = getBoardToFootprintTransform({
    footprintOrigin: componentCenter,
    ccwRotationDegrees: componentRotation,
  })
  const position = applyToPoint(boardToFootprint, center)

  let shape: string
  let size: [number, number]
  let rotation = 0
  let roundrectRatio: number | undefined
  let options: PadOptions | undefined
  let customContours: Point[][] | undefined

  if (solderPaste.shape === "oval") {
    shape = "custom"
    size = [
      Math.min(0.001, solderPaste.width, solderPaste.height),
      Math.min(0.001, solderPaste.width, solderPaste.height),
    ]
    options = new PadOptions()
    options.anchor = "circle"
    customContours = [
      createEllipseContour({
        center,
        width: solderPaste.width,
        height: solderPaste.height,
      }),
    ]
  } else if (solderPaste.shape === "polygon") {
    if (!polygonAnchor) {
      throw new Error("Solder-paste polygon is missing its anchor geometry")
    }

    shape = "custom"
    size = [polygonAnchor.diameter, polygonAnchor.diameter]
    options = new PadOptions()
    options.anchor = "circle"
    // KiCad custom-pad primitives are additive. Triangulating apertures with
    // holes preserves the filled region without filling the holes.
    customContours = solderPaste.holes?.length
      ? polygonAnchor.triangles
      : [solderPaste.points]
  } else {
    const geometry = getKicadNativePadGeometry(solderPaste)
    shape = geometry.shape
    size = geometry.size
    rotation = geometry.rotation
    roundrectRatio = geometry.roundrectRatio
  }

  const layer = solderPaste.layer === "bottom" ? "B.Paste" : "F.Paste"
  const pad = new FootprintPad({
    number: "",
    padType: "smd",
    shape,
    at: [position.x, position.y, rotation],
    size,
    layers: [layer],
    roundrectRatio,
    uuid: generateDeterministicUuid(
      `solder_paste:${solderPaste.pcb_solder_paste_id}`,
    ),
  })

  if (options) pad.options = options
  if (customContours) {
    pad.primitives = createFilledPolygonPrimitives({
      contours: customContours,
      center,
    })
  }

  return pad
}
