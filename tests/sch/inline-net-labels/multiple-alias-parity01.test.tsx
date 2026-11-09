import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { getNativeNetParity } from "../../fixtures/get-native-net-conflicts"

test("different imported aliases do not disconnect one source trace", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled>
      <schematicsection name="first" />
      <schematicsection name="second" />
      <resistor
        name="R1"
        resistance="1k"
        footprint="0402"
        schX={-1.5}
        schSectionName="first"
      />
      <resistor
        name="R2"
        resistance="1k"
        footprint="0402"
        schX={1.5}
        schSectionName="second"
      />
      <trace name="SIGNAL" from=".R1 > .pin2" to=".R2 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const labels = circuitJson
    .filter((row) => row.type === "schematic_text")
    .filter((row) => row.source_trace_id)
  expect(labels).toHaveLength(2)
  // Imported presentation aliases may differ while the source connectivity
  // still says these two separated wire stubs belong to one connection.
  labels[1]!.text = "OTHER_ALIAS"

  const { conflicts, nets } = await getNativeNetParity(circuitJson)
  expect(conflicts).toEqual([])
  expect(nets.find((net) => net.pins.includes("R1.2"))?.pins).toEqual([
    "R1.2",
    "R2.1",
  ])
}, 30_000)
