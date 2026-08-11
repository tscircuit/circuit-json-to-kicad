import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("pcb repro30 bottom footprint layer export", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0603"
        layer="bottom"
        pcbX={2}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const pcbComponents = circuitJson.filter(
    (circuitElement) => circuitElement.type === "pcb_component",
  )
  const kicadFootprints = converter.getOutput().footprints
  const referenceDesignators = ["R1", "C1"]
  const footprintLayers = pcbComponents.map((pcbComponent, index) => ({
    referenceDesignator:
      referenceDesignators[index] ?? `Component ${index + 1}`,
    circuitJsonLayer: pcbComponent.layer,
    expectedKicadLayer: pcbComponent.layer === "bottom" ? "B.Cu" : "F.Cu",
    exportedKicadLayer:
      kicadFootprints[index]?.layer
        ?.getString()
        .match(/\(layer ([^)]+)\)/)?.[1] ?? "missing",
  }))

  expect(footprintLayers).toMatchSnapshot()
})
