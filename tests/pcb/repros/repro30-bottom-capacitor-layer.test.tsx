import { expect, test } from "bun:test"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("pcb repro30 bottom capacitor footprint is exported on B.Cu", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="15mm" height="15mm" routingDisabled>
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0603"
        layer="bottom"
        pcbX={0}
        pcbY={0}
        pcbRotation={90}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as any[]

  const pcbComponent = circuitJson.find(
    (element) => element.type === "pcb_component",
  )

  expect(pcbComponent).toBeDefined()
  expect(pcbComponent?.layer).toBe("bottom")

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()
  const kicadPcb = KicadPcb.parse(outputString)[0] as KicadPcb

  expect(kicadPcb.footprints).toHaveLength(1)

  const capacitorFootprint = kicadPcb.footprints[0]

  expect(capacitorFootprint).toBeDefined()
  expect(capacitorFootprint?.layer?.getString()).toContain("B.Cu")
})
