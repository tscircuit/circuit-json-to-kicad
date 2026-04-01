import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib"

test("pcb converter embeds KIPRJMOD 3D model paths for builtin and user footprints", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-8} pcbY={0} />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0603"
        pcbX={0}
        pcbY={0}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson, {
    includeBuiltin3dModels: true,
    projectName: "my_project",
  })
  converter.runUntilFinished()
  Bun.write(
    "./tests/assets/basic-kicad-02.kicad_pcb",
    converter.getOutputString(),
  )
  const pcbContent = converter.getOutputString()
  expect(pcbContent).toContain(
    "${KIPRJMOD}/3dmodels/tscircuit_builtin.3dshapes/0603.step",
  )
  expect(pcbContent).toContain(
    "${KIPRJMOD}/3dmodels/tscircuit_builtin.3dshapes/0402.step",
  )
  // get3dModelURL() returns all source URLs for the CLI to download
  const sourcePaths = converter.getModel3dSourcePaths().sort()
  expect(sourcePaths).toContain(
    "https://modelcdn.tscircuit.com/jscad_models/0402.step",
  )
  expect(sourcePaths).toContain(
    "https://modelcdn.tscircuit.com/jscad_models/0603.step",
  )
})
