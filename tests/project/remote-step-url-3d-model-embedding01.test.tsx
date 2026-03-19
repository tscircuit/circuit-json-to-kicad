import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib"

test("pcb converter embeds KIPRJMOD path for remote stepUrl user model", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="25mm" height="40mm">
      <resistor
        resistance="1k"
        footprint="0402"
        name="R1"
        pcbY={-7}
        pcbX={-2}
      />
      <capacitor
        capacitance="1000pF"
        footprint="0402"
        name="C1"
        pcbY={-7}
        pcbX={1}
      />
      <chip
        name="U2"
        footprint="soic8"
        pcbY={-14}
        pcbX={-3}
        cadModel={{
          stepUrl: "https://modelcdn.tscircuit.com/jscad_models/soic8.step",
          rotationOffset: { x: 0, y: 0, z: 0 },
        }}
      />
      <trace from=".R1 > .pin1" to=".C1 > .pin1" />
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

  // Builtin footprints (0402) → tscircuit_builtin.3dshapes
  expect(pcbContent).toContain(
    "${KIPRJMOD}/3dmodels/tscircuit_builtin.3dshapes/0402.step",
  )

  // User model with remote stepUrl → tscircuit_builtin.3dshapes (remote URLs treated same as CDN)
  expect(pcbContent).toContain(
    "${KIPRJMOD}/3dmodels/tscircuit_builtin.3dshapes/soic8.step",
  )

  // getModel3dSourcePaths() returns clean source URLs (no query params) for CLI to download
  const sourcePaths = converter.getModel3dSourcePaths()
  expect(sourcePaths).toMatchInlineSnapshot(`
    [
      "https://modelcdn.tscircuit.com/jscad_models/0402.step",
      "https://modelcdn.tscircuit.com/jscad_models/soic8.step",
    ]
  `)
})
