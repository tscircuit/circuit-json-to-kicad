import { expect, test } from "bun:test"
import { createDrawingSubsymbol } from "lib/schematic/stages/symbols-stage-converters/createDrawingSubsymbol"

test("invisible sizing markers do not become visible KiCad circles", () => {
  const marker = {
    type: "circle",
    x: 0.55,
    y: -0.3,
    radius: 0,
    fill: false,
    color: "transparent",
  }
  const drawing = createDrawingSubsymbol({
    libId: "Custom:circle",
    symbolData: {
      primitives: [marker, { ...marker, radius: 0.2, color: "#000000" }],
    },
    isChip: false,
    c2kMatSchScale: 15,
  })

  expect(drawing.circles).toHaveLength(1)
  expect(drawing.circles[0]?.getString()).toContain("(radius 3)")
})
