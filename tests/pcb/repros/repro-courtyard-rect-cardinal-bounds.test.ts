import { expect, test } from "bun:test"
import { convertCourtyardRect } from "../../fixtures/courtyard-rect"

test("90 and 270 degree relative courtyard rotations serialize exact rectangle bounds", () => {
  const cases = [
    ...[0, 30, 45, 90, 180, 270, 360].map((componentRotation) => ({
      componentRotation,
      courtyardOffset: { x: 0, y: 0 },
      localCenter: { x: 0, y: 0 },
    })),
    ...[
      { componentRotation: 0, localCenter: { x: 1, y: 2 } },
      { componentRotation: 90, localCenter: { x: -2, y: 1 } },
      { componentRotation: 180, localCenter: { x: -1, y: -2 } },
      { componentRotation: 270, localCenter: { x: 2, y: -1 } },
      { componentRotation: -90, localCenter: { x: 2, y: -1 } },
    ].map((entry) => ({ ...entry, courtyardOffset: { x: 1, y: -2 } })),
  ]

  for (const layer of ["top", "bottom"] as const) {
    for (const relativeRotation of [90, 270]) {
      for (const { componentRotation, courtyardOffset, localCenter } of cases) {
        const footprint = convertCourtyardRect(
          layer,
          componentRotation + relativeRotation,
          undefined,
          { componentRotation, courtyardOffset },
        )
        expect(footprint.fpPolys).toHaveLength(0)
        expect(footprint.fpRects).toHaveLength(1)
        const rect = footprint.fpRects[0]!
        const start = { x: localCenter.x - 1, y: localCenter.y - 3 }
        const end = { x: localCenter.x + 1, y: localCenter.y + 3 }
        // These values have already passed through the exported PCB text.
        // Deliberately use exact equality, with no rounding or toBeCloseTo.
        expect({ x: rect.start!.x, y: rect.start!.y }).toEqual(start)
        expect({ x: rect.end!.x, y: rect.end!.y }).toEqual(end)
        expect(rect.end!.x - rect.start!.x).toBe(2)
        expect(rect.end!.y - rect.start!.y).toBe(6)
        expect(rect.getString()).toContain(`(start ${start.x} ${start.y})`)
        expect(rect.getString()).toContain(`(end ${end.x} ${end.y})`)
        expect(rect.layer?.names).toEqual([
          layer === "top" ? "F.CrtYd" : "B.CrtYd",
        ])
      }
    }
  }
})
