import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { convertCircuitJsonToKicadProjectZip } from "lib"
import path from "node:path"

const SWITCH_STEP_URL = path.resolve(
  __dirname,
  "../assets/SW_Push_1P1T_NO_CK_KMR2.step",
)
const REMOTE_USER_STEP_URL = "https://example.com/models/custom-switch.step"

test("project zip includes KiCad files and 3D model assets", async () => {
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

  const zip = await convertCircuitJsonToKicadProjectZip(
    circuit.getCircuitJson(),
    {
      projectName: "my_project",
      fetchModel: async (modelPath) => new TextEncoder().encode(modelPath),
    },
  )

  const zipFiles = Object.keys(zip.files).sort()
  expect(zipFiles).toContain("my_project.kicad_pcb")
  expect(zipFiles).toContain("my_project.kicad_sch")
  expect(zipFiles).toContain("my_project.kicad_pro")
  expect(zipFiles).toContain("3dmodels/tscircuit_builtin.3dshapes/0402.step")
  expect(zipFiles).toContain(
    "3dmodels/my_project.3dshapes/SW_Push_1P1T_NO_CK_KMR2.step",
  )
  expect(zipFiles).toContain("3dmodels/my_project.3dshapes/custom-switch.step")

  const pcbFile = zip.file("my_project.kicad_pcb")
  expect(pcbFile).toBeDefined()
  const pcbContent = await pcbFile!.async("string")
  expect(pcbContent).toContain(
    "${KIPRJMOD}/3dmodels/tscircuit_builtin.3dshapes/0402.step",
  )
  expect(pcbContent).toContain(
    "${KIPRJMOD}/3dmodels/my_project.3dshapes/custom-switch.step",
  )

  const remoteUserStepFile = zip.file(
    "3dmodels/my_project.3dshapes/custom-switch.step",
  )
  expect(remoteUserStepFile).toBeDefined()
  const remoteUserStep = await remoteUserStepFile!.async("string")
  expect(remoteUserStep).toBe(REMOTE_USER_STEP_URL)
})
