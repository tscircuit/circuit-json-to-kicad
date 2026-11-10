import { expect, test } from "bun:test"
import type { Point } from "circuit-json"
import { createDrawingSubsymbol } from "lib/schematic/stages/symbols-stage-converters/createDrawingSubsymbol"
import { transformSchematicPoint } from "lib/schematic/stages/utils/schematicCoordinates"
import { compose, rotateDEG, scale, translate } from "transformation-matrix"

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

test("library artwork rounds consistently across placements", () => {
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

test("only coordinates within roundoff of a midpoint are treated as ties", () => {
  const center = { x: 2.205, y: -2.55 }
  for (const [point, expected] of [
    [{ x: 2.2771899999999996, y: -2.622189999999999 }, "(xy 1.0829 -1.0829)"],
    [{ x: 2.27719, y: -2.62219 }, "(xy 1.0829 -1.0829)"],
    [{ x: 2.2771900000000005, y: -2.6221900000000005 }, "(xy 1.0829 -1.0829)"],
    [{ x: 2.27718999999, y: -2.62218999999 }, "(xy 1.0828 -1.0828)"],
    [{ x: 2.27719000001, y: -2.62219000001 }, "(xy 1.0829 -1.0829)"],
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

test("artwork rounding handles small scales and whole units", () => {
  for (const [coordinate, origin, factor, expected] of [
    [1.5e-7, 0, 1000, 0.0002],
    [-1.5e-7, 0, 1000, -0.0002],
    [2e-7, 1.5e-7, 1000, 0.0001],
    [1e21, 0, 1e-21, 1],
    [12, 2, 3, 30],
    [2, 2, 15, 0],
  ] as const) {
    expect(
      transformSchematicPoint(
        compose(scale(factor), translate(-origin, -origin)),
        { x: coordinate, y: coordinate },
      ),
    ).toEqual({ x: expected, y: expected })
  }
})

test("composed transforms retain their geometry", () => {
  const matrices = [translate(5, -7), rotateDEG(90), scale(2, 3)]
  const point = { x: 2, y: 3 }
  expect(transformSchematicPoint(compose(matrices), point)).toEqual({
    x: -4,
    y: -3,
  })
})

test("electrical coordinates can retain exact parser rounding", () => {
  const matrix = compose(scale(15), translate(0, 2.55))
  const point = { x: 0, y: -2.62219 }
  expect(transformSchematicPoint(matrix, point)).toEqual({ x: 0, y: -1.0829 })
  expect(
    transformSchematicPoint(matrix, point, { tolerateRoundoff: false }),
  ).toEqual({ x: 0, y: -1.0828 })
})

test("roundoff does not merge artwork separated by a native KiCad unit", () => {
  const origin = { x: 0, y: 0 }
  expect(
    drawingAt(origin, { x: 0.07219, y: 0 }).polylines[0]!.getString(),
  ).toContain("(xy 1.0829 0)")
  expect(
    drawingAt(origin, {
      x: 0.07219 + 0.0001 / 15,
      y: 0,
    }).polylines[0]!.getString(),
  ).toContain("(xy 1.083 0)")
})

test("roundoff does not choose a tie when the error budget is too large", () => {
  const matrix = compose(scale(15), translate(-1e14, 0))
  const point = { x: 1e14 + 0.07219, y: 0 }
  expect(transformSchematicPoint(matrix, point)).toEqual(
    transformSchematicPoint(matrix, point, { tolerateRoundoff: false }),
  )
})
