import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { getInlineLabelCircuit } from "../fixtures/get-inline-label-circuit"

test("a matching net name alone does not turn an annotation into a connection", async () => {
  const data = await getInlineLabelCircuit()
  for (const trace of data.filter((row) => row.type === "source_trace")) {
    trace.connected_source_net_ids = []
    trace.subcircuit_connectivity_map_key = undefined
  }
  const converter = new CircuitJsonToKicadSchConverter(data)
  converter.runUntilFinished()
  expect(converter.getOutput().labels).toHaveLength(0)
  expect(converter.getOutput().texts.map((text) => text.value)).toEqual([
    "SIGNAL",
    "SIGNAL",
  ])
})
