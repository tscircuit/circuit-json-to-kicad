/**
 * Repro: pcb_courtyard_rect.ccw_rotation and color are lost on PCB export.
 * Run: bun test tests/pcb/repros/repro-courtyard-rect-rotation-color.test.ts
 * Replace test.failing with test to see the failing geometry/color assertions.
 * The component rotation is zero so only courtyard rotation is exercised.
 */
import { expect, test } from "bun:test"
import { type CircuitJson, pcb_courtyard_rect } from "circuit-json"
import { type Footprint, KicadPcb, Xy } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import fixture from "../../assets/repro-courtyard-rect-rotation-color.circuit.json"

type Point = { x: number; y: number }
type CourtyardLayer = "top" | "bottom"

function convert(layer: CourtyardLayer, rotation: number, color?: string) {
  const circuitJson = structuredClone(fixture) as CircuitJson
  const component = circuitJson.find((e) => e.type === "pcb_component")!
  component.layer = layer
  const courtyard = circuitJson.find((e) => e.type === "pcb_courtyard_rect")!
  courtyard.layer = layer
  courtyard.ccw_rotation = rotation
  courtyard.color = color

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  // Inspect the serialized board, not just the converter's in-memory objects.
  const pcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
  expect(pcb.footprints).toHaveLength(1)
  expect(pcb.footprints[0]!.layer?.names).toEqual([
    layer === "top" ? "F.Cu" : "B.Cu",
  ])
  return pcb.footprints[0]!
}

function courtyardGraphics(footprint: Footprint, layer: CourtyardLayer) {
  const kicadLayer = layer === "top" ? "F.CrtYd" : "B.CrtYd"
  return [
    ...footprint.fpRects,
    ...footprint.fpPolys,
    ...footprint.fpLines,
  ].filter((graphic) => graphic.layer?.names.includes(kicadLayer))
}

function normalizedPoints(points: Point[]) {
  return [
    ...new Set(points.map(({ x, y }) => `${x.toFixed(6)},${y.toFixed(6)}`)),
  ].sort()
}

function courtyardCorners(footprint: Footprint, layer: CourtyardLayer) {
  const points: Point[] = []
  for (const graphic of courtyardGraphics(footprint, layer)) {
    if (graphic.token === "fp_rect" && "start" in graphic && "end" in graphic) {
      const { start, end } = graphic
      expect(start).toBeDefined()
      expect(end).toBeDefined()
      points.push(start!, { x: start!.x, y: end!.y }, end!, {
        x: end!.x,
        y: start!.y,
      })
    } else if ("points" in graphic) {
      points.push(
        ...(graphic.points?.points.filter((p) => p instanceof Xy) ?? []),
      )
    } else if ("start" in graphic && "end" in graphic) {
      points.push(graphic.start!, graphic.end!)
    }
  }
  return normalizedPoints(points)
}

const unrotatedCorners = [
  { x: -3, y: -1 },
  { x: -3, y: 1 },
  { x: 3, y: -1 },
  { x: 3, y: 1 },
]

// Footprint-local corners of a 6 x 2 mm courtyard, after Circuit JSON's
// counterclockwise rotation and the Y-axis flip into KiCad coordinates.
const rotatedCases = [
  {
    rotation: 45,
    corners: [
      { x: -Math.SQRT2, y: 2 * Math.SQRT2 },
      { x: 2 * Math.SQRT2, y: -Math.SQRT2 },
      { x: Math.SQRT2, y: -2 * Math.SQRT2 },
      { x: -2 * Math.SQRT2, y: Math.SQRT2 },
    ],
  },
  {
    rotation: 90,
    corners: [
      { x: -1, y: -3 },
      { x: -1, y: 3 },
      { x: 1, y: -3 },
      { x: 1, y: 3 },
    ],
  },
]

test("repro courtyard fixture retains both fields through schema validation", () => {
  const courtyard = pcb_courtyard_rect.parse(
    fixture.find((e) => e.type === "pcb_courtyard_rect"),
  )
  expect(courtyard.ccw_rotation).toBe(45)
  expect(courtyard.color).toBe("#ff3366")
})

for (const layer of ["top", "bottom"] as const) {
  test(`repro courtyard: unrotated ${layer} control exports correct corners`, () => {
    const footprint = convert(layer, 0)
    expect(courtyardGraphics(footprint, layer)).toHaveLength(1)
    expect(courtyardCorners(footprint, layer)).toEqual(
      normalizedPoints(unrotatedCorners),
    )
    expect(
      courtyardGraphics(footprint, layer)[0]!.stroke?.color,
    ).toBeUndefined()
  })

  for (const { rotation, corners } of rotatedCases) {
    test.failing(`repro courtyard: ${layer} preserves ccw_rotation=${rotation}`, () => {
      expect(courtyardCorners(convert(layer, rotation), layer)).toEqual(
        normalizedPoints(corners),
      )
    })
  }

  for (const [color, rgba] of [
    ["#ff3366", { r: 255, g: 51, b: 102, a: 1 }],
    ["#3366ff", { r: 51, g: 102, b: 255, a: 1 }],
  ] as const) {
    test.failing(`repro courtyard: ${layer} preserves color=${color}`, () => {
      const graphics = courtyardGraphics(convert(layer, 0, color), layer)
      expect(graphics).toHaveLength(1)
      expect(graphics[0]!.stroke?.color).toEqual(rgba)
    })
  }
}

test("repro courtyard: kicadts can serialize and parse a colored courtyard stroke", () => {
  const footprint = convert("top", 0)
  const rect = footprint.fpRects[0]!
  const rgba = { r: 255, g: 51, b: 102, a: 1 }
  rect.stroke!.color = rgba
  const pcb = new KicadPcb()
  pcb.footprints = [footprint]
  const serialized = pcb.getString()
  expect(serialized).toContain("(color 255 51 102 1)")
  const parsed = KicadPcb.parse(serialized)[0] as KicadPcb
  expect(parsed.footprints[0]!.fpRects[0]!.stroke?.color).toEqual(rgba)
})
