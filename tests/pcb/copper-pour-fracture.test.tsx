import { expect, test } from "bun:test"
import type { Point } from "circuit-json"
import { parseKicadPcb, Xy } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import {
  fracturePolygonWithHoles,
  getSignedPolygonTwiceArea,
} from "lib/pcb/stages/utils/fracture-polygon-with-holes"
import { Circuit } from "tscircuit"

const getPolygonArea = (points: readonly Point[]): number =>
  Math.abs(getSignedPolygonTwiceArea(points)) / 2

const isPointInsideEvenOdd = (
  point: Point,
  polygon: readonly Point[],
): boolean => {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x
    const yi = polygon[i]!.y
    const xj = polygon[j]!.x
    const yj = polygon[j]!.y

    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

const getWindingNumber = (point: Point, polygon: readonly Point[]): number => {
  let winding = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const cross = (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y)
    if (a.y <= point.y) {
      if (b.y > point.y && cross > 0) winding++
    } else if (b.y <= point.y && cross < 0) {
      winding--
    }
  }
  return winding
}

const hasProperSegmentCrossings = (polygon: readonly Point[]): boolean => {
  const eps = 1e-9
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  for (let i = 0; i < polygon.length; i++) {
    const a1 = polygon[i]!
    const a2 = polygon[(i + 1) % polygon.length]!
    for (let j = i + 1; j < polygon.length; j++) {
      const b1 = polygon[j]!
      const b2 = polygon[(j + 1) % polygon.length]!
      const d1 = cross(a1, a2, b1)
      const d2 = cross(a1, a2, b2)
      const d3 = cross(b1, b2, a1)
      const d4 = cross(b1, b2, a2)
      if (
        ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
        ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))
      ) {
        return true
      }
    }
  }
  return false
}

test("copper pour with clearance holes exports as one fractured filled_polygon per region", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="12mm" routingDisabled schematicDisabled>
      <resistor name="R1" resistance="1k" footprint="0805" pcbX={-4} />
      <resistor name="R2" resistance="1k" footprint="0805" pcbX={4} />
      <trace from=".R1 > .pin1" to="net.SIG_A" />
      <trace from=".R1 > .pin2" to="net.SIG_B" />
      <trace from=".R2 > .pin1" to="net.SIG_C" />
      <trace from=".R2 > .pin2" to="net.GND" />
      <copperpour connectsTo="net.GND" layer="top" clearance="0.3mm" />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const output = converter.getOutputString()

  expect(output.match(/\(filled_polygon/g) ?? []).toHaveLength(1)

  const parsedPcb = parseKicadPcb(output)
  expect(parsedPcb.zones).toHaveLength(1)
  const zone = parsedPcb.zones[0]!
  expect(zone.polygons.length).toBeGreaterThan(1)
  expect(zone.filledPolygons).toHaveLength(1)

  const extractXyPoints = (pts: { points: Array<Xy | unknown> } | undefined) =>
    (pts?.points ?? [])
      .filter((pt): pt is Xy => pt instanceof Xy)
      .map((pt) => ({ x: pt.x, y: pt.y }))

  const outerPts = extractXyPoints(zone.polygons[0]!.pts)
  const holePolys = zone.polygons
    .slice(1)
    .map((poly) => extractXyPoints(poly.pts))
  const filledPts = extractXyPoints(zone.filledPolygons[0]!.pts)

  const expectedNetArea =
    getPolygonArea(outerPts) -
    holePolys.reduce((sum, hole) => sum + getPolygonArea(hole), 0)
  expect(getPolygonArea(filledPts)).toBeCloseTo(expectedNetArea, 5)
  expect(hasProperSegmentCrossings(filledPts)).toBe(false)

  // Every hole interior must remain outside the filled copper under both even-odd and winding rules.
  for (const hole of holePolys) {
    const centroid = {
      x: hole.reduce((sum, p) => sum + p.x, 0) / hole.length,
      y: hole.reduce((sum, p) => sum + p.y, 0) / hole.length,
    }
    expect(isPointInsideEvenOdd(centroid, filledPts)).toBe(false)
    expect(getWindingNumber(centroid, filledPts)).toBe(0)
  }

  // Unobstructed pour corner must be inside the filled copper.
  const copperSample = { x: 92, y: 96 }
  expect(isPointInsideEvenOdd(copperSample, filledPts)).toBe(true)
  expect(getWindingNumber(copperSample, filledPts)).toBe(1)
}, 30_000)

test("fracturePolygonWithHoles handles collinear holes, spike tips sharing y, and concave holes", () => {
  const outer: Point[] = [
    { x: 0, y: 0 },
    { x: 0, y: 20 },
    { x: 30, y: 20 },
    { x: 30, y: 0 },
  ]
  const spikeHole: Point[] = [
    { x: 4, y: 10 },
    { x: 6, y: 13 },
    { x: 5, y: 14 },
  ]
  const shadowedRectHole: Point[] = [
    { x: 10, y: 10 },
    { x: 14, y: 10 },
    { x: 14, y: 13 },
    { x: 10, y: 13 },
  ]
  const concaveLHole: Point[] = [
    { x: 18, y: 4 },
    { x: 26, y: 4 },
    { x: 26, y: 8 },
    { x: 22, y: 8 },
    { x: 22, y: 14 },
    { x: 18, y: 14 },
  ]

  const holes = [concaveLHole, shadowedRectHole, spikeHole]
  const fractured = fracturePolygonWithHoles(outer, holes)
  expect(fractured).toBeDefined()

  const expectedArea =
    getPolygonArea(outer) -
    holes.reduce((sum, hole) => sum + getPolygonArea(hole), 0)
  expect(getPolygonArea(fractured!)).toBeCloseTo(expectedArea, 8)
  expect(hasProperSegmentCrossings(fractured!)).toBe(false)

  expect(getWindingNumber({ x: 5, y: 13 }, fractured!)).toBe(0)
  expect(getWindingNumber({ x: 12, y: 11.5 }, fractured!)).toBe(0)
  expect(getWindingNumber({ x: 20, y: 10 }, fractured!)).toBe(0)
  // Inside the notch of the concave L-hole (which IS copper!)
  expect(getWindingNumber({ x: 24, y: 11 }, fractured!)).toBe(1)
  expect(isPointInsideEvenOdd({ x: 24, y: 11 }, fractured!)).toBe(true)
})
