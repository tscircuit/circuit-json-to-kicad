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

test("writes standard portrait schematic paper", () => {
  const converter = new CircuitJsonToKicadSchConverter([], {
    paperSize: {
      height: 297,
      isPortrait: true,
      name: "A4",
      width: 210,
    },
  })
  converter.runUntilFinished()

  const paper = parseKicadSch(converter.getOutputString()).paper
  expect(paper?.size).toBe("A4")
  expect(paper?.customSize).toBeUndefined()
  expect(paper?.isPortrait).toBe(true)
})

test("writes custom portrait schematic paper without replacing its dimensions", () => {
  const converter = new CircuitJsonToKicadSchConverter([], {
    paperSize: {
      customSize: { height: 180, width: 320 },
      height: 320,
      isPortrait: true,
      name: "User",
      width: 180,
    },
  })
  converter.runUntilFinished()

  const paper = parseKicadSch(converter.getOutputString()).paper
  expect(paper?.size).toBeUndefined()
  expect(paper?.customSize).toEqual({ height: 180, width: 320 })
  expect(paper?.isPortrait).toBe(true)
})
