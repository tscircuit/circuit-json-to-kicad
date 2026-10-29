import type { PcbSolderPaste } from "circuit-json"
import {
  FootprintPad,
  PadOptions,
  PadPrimitiveGrPoly,
  PadPrimitives,
  Pts,
  Xy,
} from "kicadts"
import {
  applyToPoint,
  compose,
  rotate,
  scale,
  translate,
} from "transformation-matrix"
import { generateDeterministicUuid } from "./generateDeterministicUuid"

export const getSolderPasteCenter = (
  solderPaste: PcbSolderPaste,
): { x: number; y: number } => {
  if ("x" in solderPaste && "y" in solderPaste) {
    return { x: solderPaste.x, y: solderPaste.y }
  }

  return {
    x:
      solderPaste.points.reduce((sum, point) => sum + point.x, 0) /
      solderPaste.points.length,
    y:
      solderPaste.points.reduce((sum, point) => sum + point.y, 0) /
      solderPaste.points.length,
  }
}

/** Creates an unnumbered, paste-only KiCad pad from an explicit aperture. */
export const createSolderPastePadFromCircuitJson = ({
  solderPaste,
  componentCenter,
  componentRotation = 0,
}: {
  solderPaste: PcbSolderPaste
  componentCenter: { x: number; y: number }
  componentRotation?: number
}): FootprintPad => {
  const center = getSolderPasteCenter(solderPaste)
  const boardToFootprint = compose(
    componentRotation !== 0
      ? rotate((componentRotation * Math.PI) / 180)
      : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    scale(1, -1),
    translate(-componentCenter.x, -componentCenter.y),
  )
  const position = applyToPoint(boardToFootprint, center)

  let shape: string
  let size: [number, number]
  let rotation = 0
  let roundrectRatio: number | undefined
  let options: PadOptions | undefined
  let primitives: PadPrimitives | undefined

  switch (solderPaste.shape) {
    case "circle":
      shape = "circle"
      size = [solderPaste.radius * 2, solderPaste.radius * 2]
      break
    case "rect":
      shape = "rect"
      size = [solderPaste.width, solderPaste.height]
      break
    case "rotated_rect":
      shape = "rect"
      size = [solderPaste.width, solderPaste.height]
      rotation = solderPaste.ccw_rotation
      break
    case "oval":
      shape = "oval"
      size = [solderPaste.width, solderPaste.height]
      break
    case "pill":
      shape = "roundrect"
      size = [solderPaste.width, solderPaste.height]
      roundrectRatio =
        (solderPaste.radius ??
          Math.min(solderPaste.width, solderPaste.height) / 2) /
        Math.min(solderPaste.width, solderPaste.height)
      break
    case "rotated_pill":
      shape = "roundrect"
      size = [solderPaste.width, solderPaste.height]
      rotation = solderPaste.ccw_rotation
      roundrectRatio =
        (solderPaste.radius ??
          Math.min(solderPaste.width, solderPaste.height) / 2) /
        Math.min(solderPaste.width, solderPaste.height)
      break
    case "polygon": {
      shape = "custom"
      size = [0.2, 0.2]
      options = new PadOptions()
      options.anchor = "circle"

      const toLocalContour = (points: Array<{ x: number; y: number }>) =>
        new Pts(
          points.map((point) => {
            const localPoint = applyToPoint(
              compose(scale(1, -1), translate(-center.x, -center.y)),
              point,
            )
            return new Xy(localPoint.x, localPoint.y)
          }),
        )

      const polygon = new PadPrimitiveGrPoly()
      polygon.contours = [
        toLocalContour(solderPaste.points),
        ...(solderPaste.holes ?? []).map(toLocalContour),
      ]
      polygon.width = 0
      polygon.filled = true

      primitives = new PadPrimitives()
      primitives.addGraphic(polygon)
      break
    }
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
  if (primitives) pad.primitives = primitives

  return pad
}
