import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { getInlineLabelCircuit } from "../fixtures/get-inline-label-circuit"

test("unrelated trace annotations and text without source connectivity stay graphic", async () => {
  const data = await getInlineLabelCircuit()
  const texts = data.filter((row) => row.type === "schematic_text")
  expect(texts).toHaveLength(2)
  texts[0]!.text = "annotation"
  texts[1]!.source_trace_id = undefined
  const converter = new CircuitJsonToKicadSchConverter(data)
  converter.runUntilFinished()
  const sch = converter.getOutput()
  expect(sch.labels).toHaveLength(0)
  expect(sch.globalLabels).toHaveLength(0)
  expect(sch.texts.map((text) => text.value)).toEqual(["annotation", "SIGNAL"])
})
