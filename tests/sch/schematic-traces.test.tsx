import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"

test("schematic traces export with explicit wire stroke width", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board>
      <resistor
        name="R1"
        resistance="4.7k"
        footprint="0402"
        schX={-2}
        schY={0}
        connections={{ pin1: "R2.pin1" }}
      />
      <resistor
        name="R2"
        resistance="4.7k"
        footprint="0402"
        schX={2}
        schY={0}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const kicadSchOutput = converter.getOutputString()
  const wireBlocks = kicadSchOutput.match(/\(wire[\s\S]*?\n {2}\)/g) ?? []

  expect(wireBlocks.length).toBeGreaterThan(0)
  expect(wireBlocks.every((wire) => wire.includes("(width 0.254)"))).toBe(true)
  expect(wireBlocks.some((wire) => wire.includes("(width 0)"))).toBe(false)
})

test("power rail on wire interior splits wire and connects pins in KiCad netlist", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      <resistor
        name="R16"
        resistance="316"
        schX={0}
        schY={0}
        schRotation={90}
      />
      <resistor
        name="R17"
        resistance="316"
        schX={2}
        schY={0}
        schRotation={90}
      />
      <resistor name="R18" resistance="1k" schX={5} schY={0} schRotation={90} />
      <net name="VLS" isPowerNet />
      <trace from=".R16 > .pin2" to=".R17 > .pin2" />
      <netlabel net="VLS" anchorSide="bottom" schX={1} schY={0.5} />
      <netlabel net="VLS" connectsTo=".R18 > .pin2" schX={5} schY={1} />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const nets = await exportNativeSchematicNets(circuitJson)
  const vlsNets = nets.filter(
    (net) =>
      net.pins.includes("R16.2") ||
      net.pins.includes("R17.2") ||
      net.pins.includes("R18.2"),
  )
  expect(vlsNets).toHaveLength(1)
  expect(vlsNets[0]?.pins).toEqual(
    expect.arrayContaining(["R16.2", "R17.2", "R18.2"]),
  )
}, 30_000)
