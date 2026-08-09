import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("pcb repro30 bottom capacitor footprint matches snapshot", async () => {
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

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
  })

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "pcb",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
