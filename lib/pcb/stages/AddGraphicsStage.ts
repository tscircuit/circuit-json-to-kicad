import type {
  CircuitJson,
  PcbCutout,
  PcbCutoutRect,
  PcbSilkscreenPath,
} from "circuit-json"
import type { KicadPcb } from "kicadts"
import { GrCircle, GrLine, GrPoly } from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"
import { createFabricationNoteTextFromCircuitJson } from "./utils/CreateFabricationNoteTextFromCircuitJson"
import { applyToPoint, rotate } from "transformation-matrix"
import { createGrTextFromCircuitJson } from "./utils/CreateGrTextFromCircuitJson"
import polygonClipping, { type Geom } from "polygon-clipping"

const pointsAreEqual = (
  a?: { x: number; y: number },
  b?: { x: number; y: number },
) => !!a && !!b && a.x === b.x && a.y === b.y

const normalizeOutlineCorners = (corners: Array<{ x: number; y: number }>) => {
  const dedupedCorners: Array<{ x: number; y: number }> = []

  for (const corner of corners) {
    const previousCorner = dedupedCorners[dedupedCorners.length - 1]

    if (pointsAreEqual(previousCorner, corner)) continue

    dedupedCorners.push(corner)
  }

  while (
    dedupedCorners.length > 1 &&
    pointsAreEqual(dedupedCorners[0], dedupedCorners[dedupedCorners.length - 1])
  ) {
    dedupedCorners.pop()
  }

  return dedupedCorners
}

const EDGE_CUTS_WIDTH = 0.1
// Target length for each line segment when approximating circles (in mm)
const CIRCLE_APPROX_SEGMENT_LENGTH = 0.2
const CIRCLE_APPROX_MIN_STEPS = 16
const CIRCLE_APPROX_MAX_STEPS = 128

const appendGraphicLine = (kicadPcb: KicadPcb, grLine: GrLine) => {
  const graphicLines = kicadPcb.graphicLines
  graphicLines.push(grLine)
  kicadPcb.graphicLines = graphicLines
}

const appendGraphicCircle = (kicadPcb: KicadPcb, grCircle: GrCircle) => {
  const graphicCircles = kicadPcb.graphicCircles
  graphicCircles.push(grCircle)
  kicadPcb.graphicCircles = graphicCircles
}

const appendGraphicPoly = (kicadPcb: KicadPcb, grPoly: GrPoly) => {
  const graphicPolys = kicadPcb.graphicPolys
  graphicPolys.push(grPoly)
  kicadPcb.graphicPolys = graphicPolys
}

const rotatePointAroundOrigin = (
  point: { x: number; y: number },
  rotationDegrees = 0,
) => {
  if (!rotationDegrees) return point

  return applyToPoint(rotate((rotationDegrees * Math.PI) / 180), point)
}

const getRectCutoutCorners = (cutout: PcbCutoutRect) => {
  const halfWidth = cutout.width / 2
  const halfHeight = cutout.height / 2

  const localCorners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ]

  return localCorners.map((point) => {
    const rotatedPoint = rotatePointAroundOrigin(point, cutout.rotation)

    return {
      x: rotatedPoint.x + cutout.center.x,
      y: rotatedPoint.y + cutout.center.y,
    }
  })
}

/**
 * Adds graphics (silkscreen, board outline, etc.) to the PCB from circuit JSON
 */
export class AddGraphicsStage extends ConverterStage<CircuitJson, KicadPcb> {
  override _step(): void {
    const { kicadPcb, c2kMatPcb } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    if (!c2kMatPcb) {
      throw new Error("PCB transformation matrix not initialized in context")
    }

    // Get PCB board silkscreen paths if they exist
    const pcbSilkscreenPaths =
      this.ctx.db.pcb_silkscreen_path
        ?.list()
        .filter((path: PcbSilkscreenPath) => !path.pcb_component_id) || []

    for (const path of pcbSilkscreenPaths) {
      if (!path.route || path.route.length < 2) continue

      // Create line segments for each pair of points
      for (let i = 0; i < path.route.length - 1; i++) {
        const startPoint = path.route[i]
        const endPoint = path.route[i + 1]

        if (!startPoint || !endPoint) continue

        // Transform points to KiCad coordinates
        const transformedStart = applyToPoint(c2kMatPcb, {
          x: startPoint.x,
          y: startPoint.y,
        })
        const transformedEnd = applyToPoint(c2kMatPcb, {
          x: endPoint.x,
          y: endPoint.y,
        })

        // Map circuit JSON layer names to KiCad layer names
        const layerMap: Record<string, string> = {
          top: "F.SilkS",
          bottom: "B.SilkS",
        }
        const kicadLayer = layerMap[path.layer] || path.layer || "F.SilkS"

        // Create a graphics line
        const grLine = new GrLine({
          start: { x: transformedStart.x, y: transformedStart.y },
          end: { x: transformedEnd.x, y: transformedEnd.y },
          layer: kicadLayer,
          width: path.stroke_width || 0.15,
        })

        appendGraphicLine(kicadPcb, grLine)
      }
    }

    // Add standalone silkscreen text elements (not associated with components)
    const standaloneSilkscreenTexts =
      this.ctx.db.pcb_silkscreen_text
        ?.list()
        .filter((text: any) => !text.pcb_component_id) || []

    for (const textElement of standaloneSilkscreenTexts) {
      const grText = createGrTextFromCircuitJson({
        textElement,
        c2kMatPcb,
      })
      if (grText) {
        const graphicTexts = kicadPcb.graphicTexts
        graphicTexts.push(grText)
        kicadPcb.graphicTexts = graphicTexts
      }
    }

    // Add fabrication note text elements
    const fabricationNoteTexts =
      this.ctx.db.pcb_fabrication_note_text?.list() || []

    for (const textElement of fabricationNoteTexts) {
      const grText = createFabricationNoteTextFromCircuitJson({
        textElement,
        c2kMatPcb,
      })
      if (grText) {
        const graphicTexts = kicadPcb.graphicTexts
        graphicTexts.push(grText)
        kicadPcb.graphicTexts = graphicTexts
      }
    }

    // Add board outline from pcb_board
    const pcbBoards = this.ctx.db.pcb_board?.list() || []

    if (pcbBoards.length > 0) {
      const board = pcbBoards[0]

      if (!board) {
        this.finished = true
        return
      }

      let corners: Array<{ x: number; y: number }>

      // Check if board has a custom outline, otherwise use width/height to create rectangle
      if (board.outline && board.outline.length > 0) {
        // Use the custom outline points
        corners = normalizeOutlineCorners(board.outline)
      } else {
        // Fallback to rectangular outline based on width and height
        const halfWidth = board.width ? board.width / 2 : 0
        const halfHeight = board.height ? board.height / 2 : 0

        // Define the 4 corners of the board relative to center
        corners = [
          { x: board.center.x - halfWidth, y: board.center.y - halfHeight },
          { x: board.center.x + halfWidth, y: board.center.y - halfHeight },
          { x: board.center.x + halfWidth, y: board.center.y + halfHeight },
          { x: board.center.x - halfWidth, y: board.center.y + halfHeight },
        ]
      }

      const pcbCutouts = (this.ctx.db.pcb_cutout?.list() as PcbCutout[]) || []

      const cutoutPolys: Geom[] = []
      for (const cutout of pcbCutouts) {
        if (cutout.shape === "rect") {
          const cutoutCorners = getRectCutoutCorners(cutout)
          cutoutPolys.push([[cutoutCorners.map((c) => [c.x, c.y])]])
        } else if (cutout.shape === "circle") {
          // Approximate the circle as a polygon so polygon-clipping can process it.
          // Scaling the number of steps based on the radius to maintain smooth curves
          const circumference = 2 * Math.PI * cutout.radius
          let steps = Math.ceil(circumference / CIRCLE_APPROX_SEGMENT_LENGTH)
          steps = Math.max(CIRCLE_APPROX_MIN_STEPS, Math.min(CIRCLE_APPROX_MAX_STEPS, steps))

          const pts: [number, number][] = []
          for (let i = 0; i < steps; i++) {
            const angle = (i / steps) * Math.PI * 2
            pts.push([
              cutout.center.x + cutout.radius * Math.cos(angle),
              cutout.center.y + cutout.radius * Math.sin(angle),
            ])
          }
          cutoutPolys.push([[pts]])
        } else if (cutout.shape === "polygon") {
          cutoutPolys.push([[cutout.points.map((c) => [c.x, c.y])]])
        }
      }

      let boardGeom: Geom = [[corners.map(c => [c.x, c.y])]]
      if (cutoutPolys.length > 0) {
        boardGeom = polygonClipping.difference(boardGeom, ...cutoutPolys)
      }

      // Convert resulting polygons back to lines on Edge.Cuts
      for (const poly of boardGeom) {
        for (const ring of poly) {
          const transformedRing = ring.map((point: [number, number]) =>
            applyToPoint(c2kMatPcb, { x: point[0], y: point[1] }),
          )

          for (let i = 0; i < transformedRing.length; i++) {
            const start = transformedRing[i]
            const end = transformedRing[(i + 1) % transformedRing.length]

            if (!start || !end) continue
            if (pointsAreEqual(start, end)) continue

            const edgeLine = new GrLine({
              start: { x: start.x, y: start.y },
              end: { x: end.x, y: end.y },
              layer: "Edge.Cuts",
              width: EDGE_CUTS_WIDTH,
            })

            appendGraphicLine(kicadPcb, edgeLine)
          }
        }
      }
    }

    const pcbCutouts = (this.ctx.db.pcb_cutout?.list() as PcbCutout[]) || []

    // Independent edge.cuts for path cutouts, since polygon-clipping doesn't handle paths natively.
    // Polygon, rect, and circle cutouts were already subtracted from the board outline.
    for (const cutout of pcbCutouts) {
      if (cutout.shape === "path") {
        if (!cutout.route || cutout.route.length < 2) continue

        for (let i = 0; i < cutout.route.length - 1; i++) {
          const startPoint = cutout.route[i]
          const endPoint = cutout.route[i + 1]

          if (!startPoint || !endPoint) continue

          const transformedStart = applyToPoint(c2kMatPcb, startPoint)
          const transformedEnd = applyToPoint(c2kMatPcb, endPoint)

          appendGraphicLine(
            kicadPcb,
            new GrLine({
              start: transformedStart,
              end: transformedEnd,
              layer: "Edge.Cuts",
              width: EDGE_CUTS_WIDTH,
            }),
          )
        }
      }
    }

    this.finished = true
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
