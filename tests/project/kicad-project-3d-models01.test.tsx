import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib"

test("pcb converter embeds KIPRJMOD 3D model paths for builtin footprints", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-3} pcbY={0} />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0603"
        pcbX={3}
        pcbY={0}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson, {
    includeBuiltin3dModels: true,
  })
  converter.runUntilFinished()

  const pcbContent = converter.getOutputString()

  // .kicad_pcb should reference builtin models via KIPRJMOD
  expect(pcbContent).toContain(
    "${KIPRJMOD}/3dmodels/tscircuit_builtin.3dshapes/0402.step",
  )
  expect(pcbContent).toContain(
    "${KIPRJMOD}/3dmodels/tscircuit_builtin.3dshapes/0603.step",
  )

  // get3dModelURL() returns the CDN URLs for the CLI to download
  const sourcePaths = converter.get3dModelURL()
  expect(sourcePaths.sort()).toEqual([
    "https://modelcdn.tscircuit.com/jscad_models/0402.step",
    "https://modelcdn.tscircuit.com/jscad_models/0603.step",
  ])
})
