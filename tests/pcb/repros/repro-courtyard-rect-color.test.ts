import { expect, test } from "bun:test"
import { pcb_courtyard_rect } from "circuit-json"
import { KicadPcb } from "kicadts"
import fixture from "../../assets/repro-courtyard-rect-rotation-color.circuit.json"
import {
  convertCourtyardRect,
  getCourtyardGraphics,
} from "../../fixtures/courtyard-rect"

test("courtyard rectangles and polygons preserve stroke colors on both layers", () => {
  const courtyard = pcb_courtyard_rect.parse(
    fixture.find((element) => element.type === "pcb_courtyard_rect"),
  )
  expect(courtyard.color).toBe("#ff3366")

  for (const layer of ["top", "bottom"] as const) {
    for (const rotation of [0, 45]) {
      for (const [color, rgba] of [
        ["#ff3366", { r: 255, g: 51, b: 102, a: 1 }],
        ["#3366ff", { r: 51, g: 102, b: 255, a: 1 }],
        ["#f36", { r: 255, g: 51, b: 102, a: 1 }],
        ["#f368", { r: 255, g: 51, b: 102, a: 136 / 255 }],
        ["#ff336680", { r: 255, g: 51, b: 102, a: 128 / 255 }],
        ["rgba(255, 51, 102, 0.25)", { r: 255, g: 51, b: 102, a: 0.25 }],
        ["rgb(255, 51, 102)", { r: 255, g: 51, b: 102, a: 1 }],
        [undefined, undefined],
        ["#invalid", undefined],
      ] as const) {
        const footprint = convertCourtyardRect(layer, rotation, color)
        const graphics = getCourtyardGraphics(footprint, layer)
        expect(graphics).toHaveLength(1)
        expect(graphics[0]!.stroke?.color).toEqual(rgba)
        expect(graphics[0]!.stroke?.width).toBe(0.05)
        if (rotation === 0) {
          expect(footprint.fpRects).toHaveLength(1)
          expect(footprint.fpRects[0]!.fill).toBe(false)
        } else {
          expect(footprint.fpPolys).toHaveLength(1)
          expect(footprint.fpPolys[0]!.fill?.filled).toBe(false)
        }
      }
    }
  }

  // Control: the serializer itself preserves a supplied RGBA stroke.
  const footprint = convertCourtyardRect("top", 0)
  const rgba = { r: 255, g: 51, b: 102, a: 1 }
  footprint.fpRects[0]!.stroke!.color = rgba
  const pcb = new KicadPcb()
  pcb.footprints = [footprint]
  const serialized = pcb.getString()
  expect(serialized).toContain("(color 255 51 102 1)")
  const parsed = KicadPcb.parse(serialized)[0] as KicadPcb
  expect(parsed.footprints[0]!.fpRects[0]!.stroke?.color).toEqual(rgba)
})
