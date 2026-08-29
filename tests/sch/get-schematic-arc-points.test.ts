import { expect, test } from "bun:test"
import { getSchematicArcPoints } from "../../lib/schematic/getSchematicArcPoints"

test("preserves counterclockwise major-arc sweep", () => {
  const points = getSchematicArcPoints({
    center: { x: 0, y: 0 },
    radius: 2,
    start_angle_degrees: 0,
    end_angle_degrees: 270,
    direction: "counterclockwise",
  })

  expect(points.start.x).toBeCloseTo(2)
  expect(points.start.y).toBeCloseTo(0)
  expect(points.mid.x).toBeCloseTo(-Math.SQRT2)
  expect(points.mid.y).toBeCloseTo(Math.SQRT2)
  expect(points.end.x).toBeCloseTo(0)
  expect(points.end.y).toBeCloseTo(-2)
})

test("preserves clockwise major-arc sweep", () => {
  const points = getSchematicArcPoints({
    center: { x: 0, y: 0 },
    radius: 2,
    start_angle_degrees: 0,
    end_angle_degrees: 90,
    direction: "clockwise",
  })

  expect(points.start.x).toBeCloseTo(2)
  expect(points.start.y).toBeCloseTo(0)
  expect(points.mid.x).toBeCloseTo(-Math.SQRT2)
  expect(points.mid.y).toBeCloseTo(-Math.SQRT2)
  expect(points.end.x).toBeCloseTo(0)
  expect(points.end.y).toBeCloseTo(2)
})
