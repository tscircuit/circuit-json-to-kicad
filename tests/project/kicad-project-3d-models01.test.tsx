import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib"
import path from "node:path"

const SWITCH_STEP_URL = path.resolve(
  __dirname,
  "../assets/SW_Push_1P1T_NO_CK_KMR2.step",
)

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
      <chip
        name="SW1"
        footprint="tssop8"
        pcbX={8}
        pcbY={0}
        cadModel={{
          stepUrl: SWITCH_STEP_URL,
          rotationOffset: { x: 0, y: 0, z: 0 },
        }}
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

  const pcbContent = converter.getOutputString()

  // Builtin footprints → tscircuit_builtin.3dshapes
  expect(pcbContent).toContain(
    "${KIPRJMOD}/3dmodels/tscircuit_builtin.3dshapes/0402.step",
  )
  expect(pcbContent).toContain(
    "${KIPRJMOD}/3dmodels/tscircuit_builtin.3dshapes/0603.step",
  )

  // User model → {projectName}.3dshapes
  expect(pcbContent).toContain(
    "${KIPRJMOD}/3dmodels/my_project.3dshapes/SW_Push_1P1T_NO_CK_KMR2.step",
  )

  // get3dModelURL() returns all source URLs for the CLI to download
  const sourcePaths = converter.get3dModelURL().sort()
  expect(sourcePaths).toContain(
    "https://modelcdn.tscircuit.com/jscad_models/0402.step",
  )
  expect(sourcePaths).toContain(
    "https://modelcdn.tscircuit.com/jscad_models/0603.step",
  )
  expect(sourcePaths).toContain(SWITCH_STEP_URL)
})
