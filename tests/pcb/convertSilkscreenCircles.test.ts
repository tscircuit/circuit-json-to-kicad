import { expect, test } from "bun:test"
import { PadPrimitiveGrPoly } from "kicadts"
import { convertFabricationNotePaths } from "lib/pcb/stages/footprints-stage-converters/convertFabricationNotePaths"
import { convertSilkscreenCircles } from "lib/pcb/stages/footprints-stage-converters/convertSilkscreenCircles"
import { convertSilkscreenPaths } from "lib/pcb/stages/footprints-stage-converters/convertSilkscreenPaths"
import { createSmdPadFromCircuitJson } from "lib/pcb/stages/utils/CreateSmdPadFromCircuitJson"

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
  expect(circle!.fill).toBe(false)
})

test("silkscreen circles and paths preserve fill, dashed stroke, and color", () => {
  const [filledCircle, dashedCircle] = convertSilkscreenCircles(
    [
      {
        type: "pcb_silkscreen_circle",
        pcb_silkscreen_circle_id: "pcb_silkscreen_circle_pin1",
        pcb_component_id: "pcb_component_test",
        center: { x: 0, y: 0 },
        radius: 0.25,
        layer: "top",
        stroke_width: 0,
        is_filled: true,
        has_stroke: false,
      } as any,
      {
        type: "pcb_silkscreen_circle",
        pcb_silkscreen_circle_id: "pcb_silkscreen_circle_dashed",
        pcb_component_id: "pcb_component_test",
        center: { x: 2, y: 0 },
        radius: 1,
        layer: "bottom",
        stroke_width: 0.12,
        is_stroke_dashed: true,
        color: "#ff0000",
      } as any,
    ],
    { componentCenter: { x: 0, y: 0 } },
  )

  expect(filledCircle!.fill).toBe(true)
  expect(filledCircle!.stroke?.width).toBe(0)
  expect(dashedCircle!.fill).toBe(false)
  expect(dashedCircle!.layer?.names).toContain("B.SilkS")
  expect(dashedCircle!.stroke?.type).toBe("dash")
  expect(dashedCircle!.stroke?.color?.r).toBe(255)

  const [silkLine] = convertSilkscreenPaths(
    [
      {
        type: "pcb_silkscreen_path",
        pcb_silkscreen_path_id: "path_1",
        pcb_component_id: "pcb_component_test",
        layer: "top",
        route: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
        ],
        stroke_width: 0.15,
        stroke_type: "dashed",
        color: "rgb(0, 255, 0)",
      } as any,
    ],
    { componentCenter: { x: 0, y: 0 } },
  )
  expect(silkLine!.stroke?.type).toBe("dash")
  expect(silkLine!.stroke?.color?.g).toBe(255)

  const [fabLine] = convertFabricationNotePaths(
    [
      {
        type: "pcb_fabrication_note_path",
        pcb_fabrication_note_path_id: "fab_path_1",
        pcb_component_id: "pcb_component_test",
        layer: "top",
        route: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        stroke_width: 0.1,
        is_stroke_dashed: true,
      } as any,
    ],
    { componentCenter: { x: 0, y: 0 } },
  )
  expect(fabLine!.stroke?.type).toBe("dash")
})

test("createSmdPadFromCircuitJson uses safe interior anchor and triangulates polygon holes", () => {
  const ringPad = createSmdPadFromCircuitJson({
    pcbPad: {
      type: "pcb_smtpad",
      pcb_smtpad_id: "smtpad_ring",
      shape: "polygon",
      layer: "top",
      points: [
        { x: -2, y: -2 },
        { x: 2, y: -2 },
        { x: 2, y: 2 },
        { x: -2, y: 2 },
      ],
      holes: [
        [
          { x: -1, y: -1 },
          { x: -1, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: -1 },
        ],
      ],
    } as any,
    componentCenter: { x: 0, y: 0 },
    padNumber: 1,
  })

  expect(ringPad.shape).toBe("custom")
  expect(ringPad.size?.width).toBeLessThanOrEqual(0.001)
  // Anchor must sit in the copper ring, not inside the central [-1, 1] hole
  const anchorX = ringPad.at?.x ?? 0
  const anchorY = ringPad.at?.y ?? 0
  expect(Math.max(Math.abs(anchorX), Math.abs(anchorY))).toBeGreaterThan(1)

  const graphics = ringPad.primitives?.graphics ?? []
  expect(graphics.length).toBeGreaterThan(1)
  expect(
    graphics.every(
      (g) => g instanceof PadPrimitiveGrPoly && g.contours.length === 1,
    ),
  ).toBe(true)
})
