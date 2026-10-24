import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib"
import {
  expectValidSourceRows,
  removeConnectivityKeys,
  renderResistorCapacitor,
} from "../fixtures/keyless-net-parity"

test("an unkeyed trace does not guess between conflicting declared source nets", async () => {
  const circuitJson = await renderResistorCapacitor()
  removeConnectivityKeys(circuitJson)
  const trace = circuitJson.find((row) => row.type === "source_trace")!
  for (const [index, id] of trace.connected_source_port_ids.entries()) {
    const port = circuitJson.find(
      (row) => row.type === "source_port" && row.source_port_id === id,
    )!
    if (port.type === "source_port")
      port.subcircuit_connectivity_map_key = `conflicting_source_net_${index}`
  }
  expectValidSourceRows(circuitJson)
  expect(() => {
    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()
  }).toThrow("multiple connectivity keys")
})
