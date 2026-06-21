import { expect, test } from "bun:test"
import { getSchematicArcBounds } from "lib/schematic/schematicArcGeometry"

test("getSchematicArcBounds includes sweep extrema for partial arcs", () => {
  const bounds = getSchematicArcBounds({
    center: { x: 0, y: 0 },
    radius: 2,
    start_angle_degrees: 45,
    end_angle_degrees: 225,
    direction: "counterclockwise",
  })

  expect(bounds.minX).toBeCloseTo(-2)
  expect(bounds.minY).toBeCloseTo(-Math.SQRT2)
  expect(bounds.maxX).toBeCloseTo(Math.SQRT2)
  expect(bounds.maxY).toBeCloseTo(2)
})

test("getSchematicArcBounds treats matching start and end angles as a full circle", () => {
  const bounds = getSchematicArcBounds({
    center: { x: 1, y: -2 },
    radius: 3,
    start_angle_degrees: 15,
    end_angle_degrees: 15,
    direction: "counterclockwise",
  })

  expect(bounds.minX).toBeCloseTo(-2)
  expect(bounds.minY).toBeCloseTo(-5)
  expect(bounds.maxX).toBeCloseTo(4)
  expect(bounds.maxY).toBeCloseTo(1)
})
