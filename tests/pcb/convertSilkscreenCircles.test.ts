import { expect, test } from "bun:test"
import { convertSilkscreenCircles } from "lib/pcb/stages/footprints-stage-converters/convertSilkscreenCircles"

test("silkscreen circle centers account for component rotation", () => {
  const [circle] = convertSilkscreenCircles(
    [
      {
        type: "pcb_silkscreen_circle",
        pcb_silkscreen_circle_id: "pcb_silkscreen_circle_test",
        pcb_component_id: "pcb_component_test",
        center: { x: 11, y: 20 },
        radius: 0.5,
        layer: "top",
        stroke_width: 0.1,
      },
    ],
    {
      componentCenter: { x: 10, y: 20 },
      componentRotation: 90,
    },
  )

  expect(circle).toBeDefined()
  expect(circle!.center).toBeDefined()
  expect(circle!.end).toBeDefined()
  expect(circle!.center!.x).toBeCloseTo(0, 6)
  expect(circle!.center!.y).toBeCloseTo(1, 6)
  expect(circle!.end!.x).toBeCloseTo(0.5, 6)
  expect(circle!.end!.y).toBeCloseTo(1, 6)
})
