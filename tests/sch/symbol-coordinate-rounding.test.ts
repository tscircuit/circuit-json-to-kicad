import { expect, test } from "bun:test"
import type { Point } from "circuit-json"
import { createDrawingSubsymbol } from "lib/schematic/stages/symbols-stage-converters/createDrawingSubsymbol"
import { roundSchematicSymbolCoordinate } from "lib/schematic/stages/utils/schematicCoordinates"

const drawingAt = (center: Point, point: Point, scale = 15) =>
  createDrawingSubsymbol({
    libId: "Custom:Precision",
    isChip: false,
    c2kMatSchScale: scale,
    symbolData: {
      center,
      primitives: [
        { type: "path", points: [point] },
        { type: "rectangle", start: point, end: point },
        { type: "circle", ...point, radius: 0.1 },
        { type: "arc", start: point, mid: point, end: point },
      ],
      texts: [{ ...point, text: "Position", fontSize: 0.1 }],
    },
  })

test("library artwork subtracts and scales decimal coordinates before rounding", () => {
  const atOrigin = drawingAt({ x: 0, y: 0 }, { x: 0.07219, y: -0.07219 })
  const translated = drawingAt(
    { x: 2.205, y: -2.55 },
    { x: 2.27719, y: -2.62219 },
  )
  expect(translated.getString()).toBe(atOrigin.getString())
  expect(translated.polylines[0]!.getString()).toContain("(xy 1.0829 -1.0829)")
  expect(translated.rectangles[0]!.getString()).toContain(
    "(start 1.0829 -1.0829)",
  )
  expect(translated.circles[0]!.getString()).toContain(
    "(center 1.0829 -1.0829)",
  )
  expect(translated.arcs[0]!.getString()).toContain("(mid 1.0829 -1.0829)")
  expect(translated.texts[0]!.getString()).toContain("(at 1.0829 -1.0829")
})

test("coordinates immediately below a midpoint are not snapped to it", () => {
  const center = { x: 2.205, y: -2.55 }
  for (const [point, expected] of [
    [{ x: 2.2771899999999996, y: -2.622189999999999 }, "(xy 1.0828 -1.0828)"],
    [{ x: 2.27719, y: -2.62219 }, "(xy 1.0829 -1.0829)"],
    [{ x: 2.2771900000000005, y: -2.6221900000000005 }, "(xy 1.0829 -1.0829)"],
  ] as const) {
    expect(drawingAt(center, point).polylines[0]!.getString()).toContain(
      expected,
    )
  }
})

test.each([
  [1, 100.00005, 0.0001],
  [7.5, 100.00002, 0.0002],
  [15, 100.00001, 0.0002],
  [30, 100.000005, 0.0002],
])("decimal artwork rounding at scale %s", (scale, coordinate, expected) => {
  expect(
    drawingAt(
      { x: 100, y: -100 },
      { x: coordinate, y: -coordinate },
      scale,
    ).polylines[0]!.getString(),
  ).toContain(`(xy ${expected} ${-expected})`)
})

test("decimal midpoint coordinates agree with an integer oracle", () => {
  for (const centerNumerator of [-1_000_000, -48_500, 0, 31_490, 1_000_000]) {
    const center = centerNumerator / 100_000
    for (let numerator = -999; numerator <= 999; numerator += 18) {
      // Both inputs are five-place decimal coordinates; the exact local
      // coordinate in KiCad units is numerator * 1.5, an exact half-integer.
      const point = (centerNumerator + numerator) / 100_000
      const units = numerator * 1.5
      const expected = (Math.sign(units) * Math.round(Math.abs(units))) / 10_000
      expect(
        drawingAt(
          { x: center, y: -center },
          { x: point, y: -point },
        ).polylines[0]!.getString(),
      ).toContain(`(xy ${expected} ${-expected})`)
    }
  }
})

test("integer artwork rounding handles scientific notation and whole units", () => {
  expect(roundSchematicSymbolCoordinate(1.5e-7, 0, 1000)).toBe(0.0002)
  expect(roundSchematicSymbolCoordinate(-1.5e-7, 0, 1000)).toBe(-0.0002)
  expect(roundSchematicSymbolCoordinate(2e-7, 1.5e-7, 1000)).toBe(0.0001)
  expect(roundSchematicSymbolCoordinate(1e21, 0, 1e-21)).toBe(1)
  expect(roundSchematicSymbolCoordinate(12, 2, 3)).toBe(30)
  expect(roundSchematicSymbolCoordinate(2, 2, 15)).toBe(0)
})
