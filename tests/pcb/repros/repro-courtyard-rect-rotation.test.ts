import { expect, test } from "bun:test"
import { pcb_courtyard_rect } from "circuit-json"
import fixture from "../../assets/repro-courtyard-rect-rotation-color.circuit.json"
import {
  convertCourtyardRect,
  getCourtyardCorners,
  getCourtyardGraphics,
  normalizePoints,
} from "../../fixtures/courtyard-rect"

const unrotatedCorners = [
  { x: -3, y: -1 },
  { x: -3, y: 1 },
  { x: 3, y: -1 },
  { x: 3, y: 1 },
]

// Footprint-local corners of a 6 x 2 mm courtyard, after Circuit JSON's
// counterclockwise rotation and the Y-axis flip into KiCad coordinates.
const rotatedCases = [
  { rotation: 360, corners: unrotatedCorners },
  {
    rotation: -45,
    corners: [
      { x: -2 * Math.SQRT2, y: -Math.SQRT2 },
      { x: Math.SQRT2, y: 2 * Math.SQRT2 },
      { x: 2 * Math.SQRT2, y: Math.SQRT2 },
      { x: -Math.SQRT2, y: -2 * Math.SQRT2 },
    ],
  },
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

test("courtyard rectangles preserve rotation on top and bottom layers", () => {
  const courtyard = pcb_courtyard_rect.parse(
    fixture.find((element) => element.type === "pcb_courtyard_rect"),
  )
  expect(courtyard.ccw_rotation).toBe(45)

  for (const layer of ["top", "bottom"] as const) {
    for (const { rotation, corners } of [
      { rotation: 0, corners: unrotatedCorners },
      ...rotatedCases,
    ]) {
      const footprint = convertCourtyardRect(layer, rotation)
      expect(getCourtyardGraphics(footprint, layer)).toHaveLength(1)
      expect(getCourtyardCorners(footprint, layer)).toEqual(
        normalizePoints(corners),
      )
    }
  }
})
