import { expect, test } from "bun:test"
import { createTextFromPrimitive } from "lib/schematic/stages/symbols-stage-converters/createTextFromPrimitive"

const identityTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

test("symbol text primitives keep their authored anchor justification", () => {
  const leftText = createTextFromPrimitive({
    schText: { text: "VIN", x: 1, y: 2, fontSize: 0.2, anchor: "center_left" },
    transform: identityTransform,
    scale: 1,
  })
  expect(leftText.effects?.justify?.horizontal).toBe("left")
  expect(leftText.effects?.justify?.vertical).toBeUndefined()

  const topRightText = createTextFromPrimitive({
    schText: { text: "EN", x: 0, y: 0, fontSize: 0.2, anchor: "top_right" },
    transform: identityTransform,
    scale: 1,
  })
  expect(topRightText.effects?.justify?.horizontal).toBe("right")
  expect(topRightText.effects?.justify?.vertical).toBe("top")

  const centeredText = createTextFromPrimitive({
    schText: { text: "MID", x: 0, y: 0, fontSize: 0.2, anchor: "center" },
    transform: identityTransform,
    scale: 1,
  })
  expect(centeredText.effects?.justify).toBeUndefined()
})
