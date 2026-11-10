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
import { applyToPoint, rotate, type Matrix } from "transformation-matrix"
import { createGrTextFromCircuitJson } from "./utils/CreateGrTextFromCircuitJson"
import { circleToPolygon } from "./utils/circleToPolygon"
import { getRectanglePoints } from "./utils/getRectanglePoints"
import polygonClipping, { type MultiPolygon } from "polygon-clipping"
import { signedDistanceToPolygon } from "./utils/signedDistanceToPolygon"
import {
  KICAD_PCB_GRID_MM,
  roundBoardCoordinate,
  roundPolygonToKicadPrecision,
} from "./utils/roundPolygonToKicadPrecision"

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

// Clip geometry on KiCad's coordinate grid. Coincident rounded slots must
// share vertices instead of differing by sub-nanometer rotation noise.
const toKicadPoint = (
  point: { x: number; y: number },
  c2kMatPcb: Matrix,
): [number, number] => {
  const transformed = applyToPoint(c2kMatPcb, point)
  return [
    roundBoardCoordinate(transformed.x),
    roundBoardCoordinate(transformed.y),
  ]
}

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
  return getRectanglePoints(cutout).map((point) => {
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

    const standaloneCopperTexts =
      this.ctx.db.pcb_copper_text
        ?.list()
        .filter((text: any) => !text.pcb_component_id) || []

    for (const textElement of standaloneCopperTexts) {
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

    const outlineElements = [
      ...this.ctx.db.pcb_panel.list(),
      ...this.ctx.db.pcb_board.list(),
    ]
    const outlinePolys: MultiPolygon[] = []
    for (const board of outlineElements) {
      let corners: Array<{ x: number; y: number }>

      // Check if board has a custom outline, otherwise use width/height to create rectangle
      if (
        board.type === "pcb_board" &&
        board.outline &&
        board.outline.length > 0
      ) {
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

      outlinePolys.push([
        [corners.map((point) => toKicadPoint(point, c2kMatPcb))],
      ])
    }

    const [firstOutline, ...otherOutlines] = outlinePolys
    if (firstOutline) {
      const pcbCutouts = (this.ctx.db.pcb_cutout?.list() as PcbCutout[]) || []

      const cutoutPolys: MultiPolygon[] = []
      const circularCutouts = new Map<
        MultiPolygon,
        {
          graphic: GrCircle
          cx: number
          cy: number
          radius: number
        }
      >()
      for (const cutout of pcbCutouts) {
        if (cutout.shape === "rect") {
          const cutoutCorners = getRectCutoutCorners(cutout)
          cutoutPolys.push([
            [cutoutCorners.map((point) => toKicadPoint(point, c2kMatPcb))],
          ])
        } else if (cutout.shape === "circle") {
          const geometry: MultiPolygon = [
            [
              circleToPolygon(cutout.center, cutout.radius).map(([x, y]) =>
                toKicadPoint({ x, y }, c2kMatPcb),
              ),
            ],
          ]
          cutoutPolys.push(geometry)
          const [cx, cy] = toKicadPoint(cutout.center, c2kMatPcb)
          const [ex, ey] = toKicadPoint(
            { x: cutout.center.x + cutout.radius, y: cutout.center.y },
            c2kMatPcb,
          )
          const radius = Math.hypot(ex - cx, ey - cy)
          if (radius === 0) continue
          circularCutouts.set(geometry, {
            cx,
            cy,
            radius,
            graphic: new GrCircle({
              center: { x: cx, y: cy },
              end: { x: ex, y: ey },
              layer: "Edge.Cuts",
              width: edgeCutsWidth,
              fill: "none",
            }),
          })
        } else if (cutout.shape === "polygon") {
          cutoutPolys.push([
            [cutout.points.map((point) => toKicadPoint(point, c2kMatPcb))],
          ])
        }
      }

      // Boards inside a panel are part of the same substrate. Union their
      // outlines before subtracting routing slots, so board interiors do not
      // become holes or add crossing Edge.Cuts. Disjoint boards remain islands.
      let boardGeom: MultiPolygon =
        otherOutlines.length > 0
          ? polygonClipping.union(firstOutline, ...otherOutlines)
          : firstOutline
      // A complete, isolated circle is an exact KiCad primitive. Keep polygon
      // clipping for notches, intersecting cutouts and ambiguous near contacts.
      const bounds = cutoutPolys.map((geometry) => {
        const circle = circularCutouts.get(geometry)
        if (circle) {
          const r = circle.radius + KICAD_PCB_GRID_MM
          return {
            minX: circle.cx - r,
            maxX: circle.cx + r,
            minY: circle.cy - r,
            maxY: circle.cy + r,
          }
        }
        const ring = geometry[0]![0]!
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity
        for (const [x, y] of ring) {
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
        }
        return { minX, maxX, minY, maxY }
      })
      const clippedCutouts = cutoutPolys.filter((geometry, index) => {
        const circle = circularCutouts.get(geometry)
        if (!circle) return true
        const requiredClearance = circle.radius + KICAD_PCB_GRID_MM
        if (
          signedDistanceToPolygon(circle.cx, circle.cy, boardGeom) <=
          requiredClearance
        )
          return true
        const box = bounds[index]!
        const intersectsAnotherCutout = cutoutPolys.some(
          (other, otherIndex) => {
            if (index === otherIndex) return false
            const otherBox = bounds[otherIndex]!
            if (
              box.minX > otherBox.maxX ||
              box.maxX < otherBox.minX ||
              box.minY > otherBox.maxY ||
              box.maxY < otherBox.minY
            )
              return false
            const otherCircle = circularCutouts.get(other)
            if (otherCircle) {
              return (
                Math.hypot(
                  circle.cx - otherCircle.cx,
                  circle.cy - otherCircle.cy,
                ) <=
                requiredClearance + otherCircle.radius
              )
            }
            return (
              signedDistanceToPolygon(circle.cx, circle.cy, other) >=
              -requiredClearance
            )
          },
        )
        if (intersectsAnotherCutout) return true
        appendGraphicCircle(kicadPcb, circle.graphic)
        return false
      })
      if (clippedCutouts.length > 0) {
        boardGeom = polygonClipping.difference(
          roundPolygonToKicadPrecision(boardGeom),
          ...clippedCutouts,
        )
      }

      // Intersections can lie between grid points. Quantize them before
      // the existing duplicate-endpoint check to avoid zero-length edges.
      boardGeom = roundPolygonToKicadPrecision(boardGeom)

      // Convert resulting polygons back to lines on Edge.Cuts
      for (const poly of boardGeom) {
        for (const ring of poly) {
          const transformedRing = ring.map(([x, y]) => ({
            x,
            y,
          }))

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
