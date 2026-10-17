import type {
  CircuitJson,
  PcbCutout,
  PcbCutoutRect,
  PcbSilkscreenPath,
} from "circuit-json"
import type { KicadPcb } from "kicadts"
import { type GrCircle, GrLine, type GrPoly } from "kicadts"
import polygonClipping, { type MultiPolygon } from "polygon-clipping"
import { applyToPoint, rotate } from "transformation-matrix"
import { type ConverterContext, ConverterStage } from "../../types"
import { createFabricationNoteTextFromCircuitJson } from "./utils/CreateFabricationNoteTextFromCircuitJson"
import { createGrTextFromCircuitJson } from "./utils/CreateGrTextFromCircuitJson"
import { circleToPolygon } from "./utils/circleToPolygon"

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

const DEFAULT_EDGE_CUTS_WIDTH = 0.1

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

const ROUNDED_RECT_CORNER_ARC_SEGMENT_COUNT = 8

const getRectCutoutCorners = (cutout: PcbCutoutRect) => {
  const halfWidth = cutout.width / 2
  const halfHeight = cutout.height / 2
  const cornerRadius = Math.max(
    0,
    Math.min(
      cutout.corner_radius ?? 0,
      Math.abs(halfWidth),
      Math.abs(halfHeight),
    ),
  )

  let localCorners: Array<{ x: number; y: number }>
  if (cornerRadius === 0) {
    localCorners = [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight },
    ]
  } else {
    localCorners = []
    const corners = [
      {
        center: { x: halfWidth - cornerRadius, y: -halfHeight + cornerRadius },
        start: -Math.PI / 2,
        end: 0,
      },
      {
        center: { x: halfWidth - cornerRadius, y: halfHeight - cornerRadius },
        start: 0,
        end: Math.PI / 2,
      },
      {
        center: { x: -halfWidth + cornerRadius, y: halfHeight - cornerRadius },
        start: Math.PI / 2,
        end: Math.PI,
      },
      {
        center: {
          x: -halfWidth + cornerRadius,
          y: -halfHeight + cornerRadius,
        },
        start: Math.PI,
        end: (3 * Math.PI) / 2,
      },
    ]

    for (const corner of corners) {
      for (let i = 0; i <= ROUNDED_RECT_CORNER_ARC_SEGMENT_COUNT; i++) {
        const t = i / ROUNDED_RECT_CORNER_ARC_SEGMENT_COUNT
        const angle = corner.start + (corner.end - corner.start) * t
        localCorners.push({
          x: corner.center.x + cornerRadius * Math.cos(angle),
          y: corner.center.y + cornerRadius * Math.sin(angle),
        })
      }
    }
  }

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
    const edgeCutsWidth = this.ctx.edgeCutsWidth ?? DEFAULT_EDGE_CUTS_WIDTH

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

    // Add board outline from pcb_board and solid cutouts from pcb_cutout
    const pcbBoards = this.ctx.db.pcb_board?.list() || []
    const pcbCutouts = (this.ctx.db.pcb_cutout?.list() as PcbCutout[]) || []

    const cutoutPolys: MultiPolygon[] = []
    for (const cutout of pcbCutouts) {
      if (cutout.shape === "rect") {
        const cutoutCorners = getRectCutoutCorners(cutout)
        cutoutPolys.push([[cutoutCorners.map((c) => [c.x, c.y])]])
      } else if (cutout.shape === "circle") {
        // Approximate the circle as a polygon so polygon-clipping can process it.
        // Scaling the number of steps based on the radius to maintain smooth curves
        cutoutPolys.push([[circleToPolygon(cutout.center, cutout.radius)]])
      } else if (cutout.shape === "polygon") {
        cutoutPolys.push([[cutout.points.map((c) => [c.x, c.y])]])
      }
    }

    const emitGeomOnEdgeCuts = (geom: MultiPolygon) => {
      for (const poly of geom) {
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
              width: edgeCutsWidth,
            })

            appendGraphicLine(kicadPcb, edgeLine)
          }
        }
      }
    }

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

      let boardGeom: MultiPolygon = [[corners.map((c) => [c.x, c.y])]]
      if (cutoutPolys.length > 0) {
        boardGeom = polygonClipping.difference(boardGeom, ...cutoutPolys)
      }

      emitGeomOnEdgeCuts(boardGeom)
    } else if (cutoutPolys.length > 0) {
      for (const cutoutPoly of cutoutPolys) {
        emitGeomOnEdgeCuts(cutoutPoly)
      }
    }

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
              width: edgeCutsWidth,
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
