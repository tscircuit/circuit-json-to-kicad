import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("panel export with 2x2 tab-routing does not throw in polygon clipping (#814)", async () => {
  const circuit = new Circuit()
  const B = () => (
    <board width="14mm" height="18mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} />
      <capacitor name="C1" capacitance="100nF" footprint="0402" pcbX={2} />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
    </board>
  )

  circuit.add(
    <panel
      layoutMode="grid"
      row={2}
      col={2}
      boardGap="2mm"
      panelizationMethod="tab-routing"
      tabLength="3mm"
    >
      <B />
      <B />
      <B />
      <B />
    </panel>,
  )

  await circuit.render()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const pcb = converter.getOutput()
  expect(pcb).toBeDefined()
})

test("panel export with borderRadius and tab-routing does not throw in polygon clipping (#814)", async () => {
  const circuit = new Circuit()
  const B = () => (
    <board width="14mm" height="18mm" borderRadius="2mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} />
      <capacitor name="C1" capacitance="100nF" footprint="0402" pcbX={2} />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
    </board>
  )

  circuit.add(
    <panel
      layoutMode="grid"
      row={2}
      col={2}
      boardGap="2mm"
      panelizationMethod="tab-routing"
      tabLength="3mm"
    >
      <B />
      <B />
      <B />
      <B />
    </panel>,
  )

  await circuit.render()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const pcb = converter.getOutput()
  expect(pcb).toBeDefined()
})
