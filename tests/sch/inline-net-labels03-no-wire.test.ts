import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { getInlineLabelCircuit } from "../fixtures/get-inline-label-circuit"

test("source-backed text without a schematic wire remains graphic", async () => {
  const data = (await getInlineLabelCircuit()).filter(
    (row) => row.type !== "schematic_trace",
  )
  const converter = new CircuitJsonToKicadSchConverter(data)
  converter.runUntilFinished()
  expect(converter.getOutput().labels).toHaveLength(0)
  expect(converter.getOutput().texts.map((text) => text.value)).toEqual([
    "SIGNAL",
    "SIGNAL",
  ])
})
