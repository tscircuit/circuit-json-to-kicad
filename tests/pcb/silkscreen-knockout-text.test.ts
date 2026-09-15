import { expect, test } from "bun:test"
import type { PcbSilkscreenText } from "circuit-json"
import { identity } from "transformation-matrix"
import { createGrTextFromCircuitJson } from "../../lib/pcb/stages/utils/CreateGrTextFromCircuitJson"
import { createFpTextFromCircuitJson } from "../../lib/pcb/stages/utils/CreateFpTextFromCircuitJson"

const knockoutText: PcbSilkscreenText = {
  type: "pcb_silkscreen_text",
  pcb_silkscreen_text_id: "pcb_silkscreen_text_knockout",
  pcb_component_id: "pcb_component_1",
  text: "LED with USB-C",
  font: "tscircuit2024",
  font_size: 1,
  anchor_position: { x: 10, y: 20 },
  anchor_alignment: "bottom_left",
  layer: "bottom",
  is_mirrored: true,
  is_knockout: true,
}

test("preserves knockout on standalone silkscreen text", () => {
  const text = createGrTextFromCircuitJson({
    textElement: knockoutText,
    c2kMatPcb: identity(),
  })

  expect(text?.getString()).toContain("(layer B.SilkS knockout)")
})

test("preserves knockout on footprint silkscreen text", () => {
  const text = createFpTextFromCircuitJson({
    textElement: knockoutText,
    componentCenter: { x: 10, y: 20 },
  })

  expect(text?.getString()).toContain("(layer B.SilkS knockout)")
})
