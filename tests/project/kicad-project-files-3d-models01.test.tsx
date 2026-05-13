import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import {
  CircuitJsonToKicadPcbConverter,
  getKicadProject3dModelFiles,
} from "lib"
import path from "node:path"

const SWITCH_STEP_URL = path.resolve(
  __dirname,
  "../assets/SW_Push_1P1T_NO_CK_KMR2.step",
)
const REMOTE_USER_STEP_URL = "https://example.com/models/custom-switch.step"

test("converter model source paths can be mapped to KiCad project model paths", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-8} />
      <capacitor name="C1" capacitance="100nF" footprint="0603" pcbX={0} />
      <chip
        name="SW1"
        footprint="tssop8"
        pcbX={8}
        cadModel={{
          stepUrl: SWITCH_STEP_URL,
          rotationOffset: { x: 0, y: 0, z: 0 },
        }}
      />
      <chip
        name="SW2"
        footprint="tssop8"
        pcbX={12}
        cadModel={{
          stepUrl: REMOTE_USER_STEP_URL,
          rotationOffset: { x: 0, y: 0, z: 0 },
        }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const pcbConverter = new CircuitJsonToKicadPcbConverter(
    circuit.getCircuitJson(),
    {
      includeBuiltin3dModels: true,
      projectName: "my_project",
    },
  )
  pcbConverter.runUntilFinished()

  const files = getKicadProject3dModelFiles({
    projectName: "my_project",
    model3dSourcePaths: pcbConverter.getModel3dSourcePaths(),
  })

  const filePaths = files.map((file) => file.projectPath).sort()
  expect(filePaths).toContain("3dmodels/tscircuit_builtin.3dshapes/0402.step")
  expect(filePaths).toContain(
    "3dmodels/my_project.3dshapes/SW_Push_1P1T_NO_CK_KMR2.step",
  )
  expect(filePaths).toContain("3dmodels/my_project.3dshapes/custom-switch.step")

  const pcbContent = pcbConverter.getOutputString()
  expect(pcbContent).toContain(
    "${KIPRJMOD}/3dmodels/tscircuit_builtin.3dshapes/0402.step",
  )
  expect(pcbContent).toContain(
    "${KIPRJMOD}/3dmodels/my_project.3dshapes/custom-switch.step",
  )

  const remoteUserStepFile = files.find(
    (file) =>
      file.projectPath === "3dmodels/my_project.3dshapes/custom-switch.step",
  )
  expect(remoteUserStepFile?.sourcePath).toBe(REMOTE_USER_STEP_URL)
})

test("3D model file entries use KiCad project model paths", async () => {
  const files = getKicadProject3dModelFiles({
    projectName: "my_project",
    model3dSourcePaths: [
      "https://modelcdn.tscircuit.com/jscad_models/0402.step",
      REMOTE_USER_STEP_URL,
    ],
  })

  expect(files).toEqual([
    {
      sourcePath: "https://modelcdn.tscircuit.com/jscad_models/0402.step",
      projectPath: "3dmodels/tscircuit_builtin.3dshapes/0402.step",
    },
    {
      sourcePath: REMOTE_USER_STEP_URL,
      projectPath: "3dmodels/my_project.3dshapes/custom-switch.step",
    },
  ])
})
