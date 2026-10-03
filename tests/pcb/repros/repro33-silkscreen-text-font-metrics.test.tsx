import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { glyphAdvanceRatio } from "@tscircuit/alphabet"

// https://github.com/tscircuit/cli/issues/4719
// Exported native text must carry the source font's metrics so the width
// reviewed in the SVG preview is the width placed on the KiCad board.
test("pcb repro33 silkscreen text exports source font metrics", () => {
  const circuitJson = JSON.parse(
    readFileSync("tests/assets/simple-circuit.json", "utf8"),
  ) as any[]

  const text = "SN74LVC1G17DCKR"
  const fontSize = 0.8

  circuitJson.push({
    type: "pcb_silkscreen_text",
    pcb_silkscreen_text_id: "repro33_text",
    pcb_component_id: "",
    font: "tscircuit2024",
    font_size: fontSize,
    text,
    layer: "top",
    anchor_position: { x: 0, y: 0 },
    anchor_alignment: "center",
  })

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const outputString = converter.getOutputString()

  const match = outputString.match(
    /\(gr_text\s+"SN74LVC1G17DCKR"[\s\S]*?\(size ([0-9.]+) ([0-9.]+)\)[\s\S]*?\(thickness ([0-9.]+)\)/,
  )
  expect(match).not.toBeNull()

  const [, height, width, thickness] = match!

  // Source allocation: every glyph advances by glyphAdvanceRatio * fontSize,
  // so the native cell width must equal that advance, not fontSize itself
  const expectedWidth = fontSize * glyphAdvanceRatio["S"]!
  expect(Number(width)).toBeCloseTo(expectedWidth, 4)
  expect(Number(height)).toBeCloseTo(fontSize, 4)
  expect(Number(thickness)).toBeCloseTo(fontSize * 0.09, 4)

  // The exported line of text spans the same width the source layout
  // allocated: text.length * advance, ~30% narrower than (size 0.8 0.8)
  const sourceWidth = text.length * expectedWidth
  expect(sourceWidth).toBeCloseTo(8.305, 2)
})
