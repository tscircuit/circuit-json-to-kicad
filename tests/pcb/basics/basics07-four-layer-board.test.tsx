import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("pcb basics07 four-layer board", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" layers={4}>
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-5} pcbY={3} />
      <resistor
        name="R2"
        resistance="2.2k"
        footprint="0402"
        pcbX={5}
        pcbY={3}
      />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0603"
        layer="bottom"
        pcbX={-5}
        pcbY={-3}
        connections={{ pin1: "R1.pin2" }}
      />
      <capacitor
        name="C2"
        capacitance="10uF"
        footprint="0805"
        layer="bottom"
        pcbX={5}
        pcbY={-3}
        connections={{ pin1: "R2.pin2" }}
      />
      {/* Connect components with traces on different layers */}
      <trace from=".R1 > .pin1" to=".C1 > .pin2" />
      <trace from=".R2 > .pin1" to=".C2 > .pin2" />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  Bun.write(
    "./debug-output/four-layer-circuit.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)

  converter.runUntilFinished()

  const outputString = converter.getOutputString()
  Bun.write("./debug-output/four-layer.kicad_pcb", outputString)

  // Verify that the output contains 4 copper layers
  expect(outputString).toContain("F.Cu")
  expect(outputString).toContain("In1.Cu")
  expect(outputString).toContain("In2.Cu")
  expect(outputString).toContain("B.Cu")

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
