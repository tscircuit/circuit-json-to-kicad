import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import {
  expectValidSourceRows,
  renderResistorCapacitor,
} from "../fixtures/keyless-net-parity"

test("an empty source trace does not add labels to an already named connection", async () => {
  const circuitJson = await renderResistorCapacitor()
  const countLabels = () => {
    const converter = new CircuitJsonToKicadSchConverter(circuitJson)
    converter.runUntilFinished()
    return converter.getOutputString().match(/\(global_label\s/g)?.length ?? 0
  }
  const originalCount = countLabels()
  expect(originalCount).toBeGreaterThan(0)
  circuitJson.push(
    {
      type: "source_trace",
      source_trace_id: "empty_source_trace",
      connected_source_port_ids: [],
      connected_source_net_ids: [],
    },
    {
      type: "schematic_trace",
      schematic_trace_id: "empty_schematic_trace",
      source_trace_id: "empty_source_trace",
      edges: [],
      junctions: [],
    },
  )
  expectValidSourceRows(circuitJson)
  expect(countLabels()).toBe(originalCount)
})
