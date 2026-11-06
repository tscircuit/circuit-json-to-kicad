import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { applyToPoint } from "transformation-matrix"
import { exportNativeSchematicNets } from "../../fixtures/export-native-schematic-nets"

test("source-trace-backed inline labels connect without a source_net record", async () => {
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
  const sourceTraces = circuitJson.filter((row) => row.type === "source_trace")
  const labels = circuitJson.filter((row) => row.type === "schematic_text")

  // Core names this connection through its source trace, not a source_net.
  expect(circuitJson.filter((row) => row.type === "source_net")).toHaveLength(0)
  expect(sourceTraces).toHaveLength(1)
  expect(labels).toHaveLength(2)
  expect(
    labels.every(
      (label) => label.source_trace_id === sourceTraces[0]!.source_trace_id,
    ),
  ).toBe(true)

  // Core supplies the attachment point. The converter must not move it to
  // a free endpoint or search for a nearby wire.
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  expect(converter.getOutput().labels).toHaveLength(labels.length)
  for (const [index, text] of labels.entries()) {
    const expectedPosition = applyToPoint(
      converter.ctx.c2kMatSch!,
      text.position,
    )
    const label = converter.getOutput().labels[index]!
    expect(label.at?.x).toBeCloseTo(expectedPosition.x)
    expect(label.at?.y).toBeCloseTo(expectedPosition.y)
  }

  const nets = await exportNativeSchematicNets(circuitJson)
  expect(
    nets.filter(
      (net) => net.pins.includes("R1.2") || net.pins.includes("R2.1"),
    ),
  ).toEqual([{ name: "/SIGNAL", pins: ["R1.2", "R2.1"] }])
}, 30_000)
