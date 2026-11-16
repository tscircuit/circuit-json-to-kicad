import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib"
import { Circuit } from "tscircuit"
import { exportNativePcbNets } from "../../fixtures/export-native-pcb-nets"

test("duplicate named nets do not take another board's existing suffixed name", async () => {
  const circuit = new Circuit()
  circuit.add(
    <panel layoutMode="grid" row={1} col={3} boardGap="2mm">
      {["GND", "GND", "GND_2"].map((netName, index) => (
        <board key={index} width="14mm" height="18mm" schematicDisabled>
          <resistor name="R1" resistance="1k" footprint="0402" />
          <trace from=".R1 > .pin1" to={`net.${netName}`} />
        </board>
      ))}
    </panel>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const nativeNets = await exportNativePcbNets(converter.getOutputString())
  expect(nativeNets.map((net) => net.name).sort()).toEqual([
    "GND",
    "GND_2",
    "GND_3",
  ])
  for (const net of nativeNets) expect(net.pins).toHaveLength(1)
})
