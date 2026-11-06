import { expect, test } from "bun:test"
import {
  convertCourtyardRect,
  getCourtyardPoints,
  normalizePoints,
} from "../../fixtures/courtyard-rect"

test("offset courtyards keep their board geometry on rotated top and bottom components", () => {
  for (const layer of ["top", "bottom"] as const) {
    for (const componentRotation of [30, 45, 90]) {
      const footprint = convertCourtyardRect(layer, 45, undefined, {
        componentRotation,
        courtyardOffset: { x: 1, y: -2 },
      })
      const position = footprint.position!
      const angle = "angle" in position ? (position.angle ?? 0) : 0
      expect(angle).toBe(componentRotation)
      const radians = (angle * Math.PI) / 180
      // Place the exported local geometry back on the board, as KiCad does.
      const boardPoints = getCourtyardPoints(footprint, layer).map(
        ({ x, y }) => ({
          x: position.x + x * Math.cos(radians) + y * Math.sin(radians),
          y: position.y - x * Math.sin(radians) + y * Math.cos(radians),
        }),
      )
      // Circuit JSON (3, 1) -> KiCad (103, 99), independent of parent rotation.
      expect(normalizePoints(boardPoints)).toEqual(
        normalizePoints([
          { x: 103 - Math.SQRT2, y: 99 + 2 * Math.SQRT2 },
          { x: 103 + 2 * Math.SQRT2, y: 99 - Math.SQRT2 },
          { x: 103 + Math.SQRT2, y: 99 - 2 * Math.SQRT2 },
          { x: 103 - 2 * Math.SQRT2, y: 99 + Math.SQRT2 },
        ]),
      )
    }
  }
})
