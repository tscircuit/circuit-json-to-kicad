import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "../../lib"

test("writes supplied schematic title-block metadata", () => {
  const converter = new CircuitJsonToKicadSchConverter([], {
    paperSize: { height: 215.9, name: "USLetter", width: 279.4 },
    titleBlock: {
      company: "Example Company",
      comments: [{ index: 1, text: "Open hardware" }],
      date: "2026-09-05",
      revision: "1.2",
      title: "Example board",
    },
  })
  converter.runUntilFinished()

  const schematic = parseKicadSch(converter.getOutputString())
  expect(schematic.titleBlock?.title).toBe("Example board")
  expect(schematic.titleBlock?.date).toBe("2026-09-05")
  expect(schematic.titleBlock?.rev).toBe("1.2")
  expect(schematic.titleBlock?.company).toBe("Example Company")
  expect(schematic.titleBlock?.getComment(1)).toBe("Open hardware")
  expect(schematic.paper?.size).toBe("USLetter")
})
