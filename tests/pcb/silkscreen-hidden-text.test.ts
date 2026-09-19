import { expect, test } from "bun:test"
import type { PcbSilkscreenText } from "circuit-json"
import { identity } from "transformation-matrix"
import { createFpTextFromCircuitJson } from "../../lib/pcb/stages/utils/CreateFpTextFromCircuitJson"
import { createGrTextFromCircuitJson } from "../../lib/pcb/stages/utils/CreateGrTextFromCircuitJson"

type PcbSilkscreenTextWithHidden = PcbSilkscreenText & {
  is_hidden?: boolean
}

const baseText: PcbSilkscreenTextWithHidden = {
  type: "pcb_silkscreen_text",
  pcb_silkscreen_text_id: "pcb_silkscreen_text_visibility",
  pcb_component_id: "pcb_component_1",
  text: "R1",
  font: "tscircuit2024",
  font_size: 1,
  anchor_position: { x: 10, y: 20 },
  anchor_alignment: "center",
  layer: "top",
}

test.each([
  [
    "standalone",
    (textElement: PcbSilkscreenTextWithHidden) =>
      createGrTextFromCircuitJson({ textElement, c2kMatPcb: identity() }),
  ],
  [
    "footprint",
    (textElement: PcbSilkscreenTextWithHidden) =>
      createFpTextFromCircuitJson({
        textElement,
        componentCenter: { x: 10, y: 20 },
      }),
  ],
] as const)("omits hidden %s silkscreen text", (_, convert) => {
  expect(convert({ ...baseText, is_hidden: true })).toBeNull()
})

test.each([
  [
    "standalone",
    (textElement: PcbSilkscreenTextWithHidden) =>
      createGrTextFromCircuitJson({ textElement, c2kMatPcb: identity() }),
  ],
  [
    "footprint",
    (textElement: PcbSilkscreenTextWithHidden) =>
      createFpTextFromCircuitJson({
        textElement,
        componentCenter: { x: 10, y: 20 },
      }),
  ],
] as const)("keeps visible %s silkscreen text", (_, convert) => {
  expect(convert(baseText)).not.toBeNull()
  expect(convert({ ...baseText, is_hidden: false })).not.toBeNull()
})
