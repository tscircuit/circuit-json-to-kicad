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
import { circleToPolygon } from "./utils/circleToPolygon"
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

const appendPolygonRingToEdgeCuts = (
  kicadPcb: KicadPcb,
  ring: Array<[number, number] | { x: number; y: number }>,
  c2kMatPcb: any,
  edgeCutsWidth: number,
) => {
  const transformedRing = ring.map((point) => {
    const pt = Array.isArray(point) ? { x: point[0], y: point[1] } : point
    return applyToPoint(c2kMatPcb, pt)
  })

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

    // Component-owned PCB notes are already exported as footprint text.
    const standaloneNoteTexts =
      this.ctx.db.pcb_note_text
        ?.list()
        .filter((text) => !text.pcb_component_id) || []

    // Both note types belong on the fabrication layers.
    const fabricationNoteTexts =
      this.ctx.db.pcb_fabrication_note_text?.list() || []

    for (const textElement of [
      ...fabricationNoteTexts,
      ...standaloneNoteTexts,
    ]) {
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

    // Add panel outline from pcb_panel if present
    const pcbPanels =
      (this.ctx.db.pcb_panel?.list() as any[]) ||
      (this.ctx.circuitJson as any[]).filter((e) => e.type === "pcb_panel") ||
      []

    for (const panel of pcbPanels) {
      let panelCorners: Array<{ x: number; y: number }>
      if (panel.outline && panel.outline.length > 0) {
        panelCorners = normalizeOutlineCorners(panel.outline)
      } else {
        const halfWidth = panel.width ? panel.width / 2 : 0
        const halfHeight = panel.height ? panel.height / 2 : 0
        panelCorners = [
          { x: panel.center.x - halfWidth, y: panel.center.y - halfHeight },
          { x: panel.center.x + halfWidth, y: panel.center.y - halfHeight },
          { x: panel.center.x + halfWidth, y: panel.center.y + halfHeight },
          { x: panel.center.x - halfWidth, y: panel.center.y + halfHeight },
        ]
      }
      appendPolygonRingToEdgeCuts(
        kicadPcb,
        panelCorners,
        c2kMatPcb,
        edgeCutsWidth,
      )
    }

    // Build cutout geometries
    const pcbCutouts = (this.ctx.db.pcb_cutout?.list() as PcbCutout[]) || []
    const cutoutGeoms = new Map<PcbCutout, Geom>()

    for (const cutout of pcbCutouts) {
      if (cutout.shape === "rect") {
        const cutoutCorners = getRectCutoutCorners(cutout)
        cutoutGeoms.set(cutout, [[cutoutCorners.map((c) => [c.x, c.y])]])
      } else if (cutout.shape === "circle") {
        cutoutGeoms.set(cutout, [
          [circleToPolygon(cutout.center, cutout.radius)],
        ])
      } else if (cutout.shape === "polygon") {
        cutoutGeoms.set(cutout, [[cutout.points.map((c) => [c.x, c.y])]])
      }
    }

    const subtractedCutouts = new Set<PcbCutout>()

    // Add board outline from all pcb_boards
    const pcbBoards = this.ctx.db.pcb_board?.list() || []

    for (const board of pcbBoards) {
      let corners: Array<{ x: number; y: number }>

      if (board.outline && board.outline.length > 0) {
        corners = normalizeOutlineCorners(board.outline)
      } else {
        const halfWidth = board.width ? board.width / 2 : 0
        const halfHeight = board.height ? board.height / 2 : 0

        corners = [
          { x: board.center.x - halfWidth, y: board.center.y - halfHeight },
          { x: board.center.x + halfWidth, y: board.center.y - halfHeight },
          { x: board.center.x + halfWidth, y: board.center.y + halfHeight },
          { x: board.center.x - halfWidth, y: board.center.y + halfHeight },
        ]
      }

      let boardGeom: Geom = [[corners.map((c) => [c.x, c.y])]]
      const intersectingCutoutGeoms: Geom[] = []

      for (const [cutout, cutoutGeom] of cutoutGeoms.entries()) {
        const intersection = polygonClipping.intersection(boardGeom, cutoutGeom)
        if (intersection.length > 0 && Boolean(intersection[0]?.length)) {
          intersectingCutoutGeoms.push(cutoutGeom)
          subtractedCutouts.add(cutout)
        }
      }

      if (intersectingCutoutGeoms.length > 0) {
        boardGeom = polygonClipping.difference(
          boardGeom,
          ...intersectingCutoutGeoms,
        )
      }

      for (const poly of boardGeom) {
        for (const ring of poly) {
          appendPolygonRingToEdgeCuts(
            kicadPcb,
            ring as Array<[number, number]>,
            c2kMatPcb,
            edgeCutsWidth,
          )
        }
      }
    }

    // Emit remaining cutouts that were not subtracted from a board
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
      } else if (!subtractedCutouts.has(cutout)) {
        const cutoutGeom = cutoutGeoms.get(cutout)
        if (cutoutGeom) {
          for (const poly of cutoutGeom) {
            for (const ring of poly) {
              appendPolygonRingToEdgeCuts(
                kicadPcb,
                ring as Array<[number, number]>,
                c2kMatPcb,
                edgeCutsWidth,
              )
            }
          }
        }
      }
    }
    this.finished = true
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
