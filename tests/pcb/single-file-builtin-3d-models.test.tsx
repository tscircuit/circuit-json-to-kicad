import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib"

test("single-file CircuitJsonToKicadPcbConverter includes builtin 3D model references by default", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <resistor name="R1" resistance="1k" footprint="0603" pcbX={0} pcbY={0} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const defaultConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
  defaultConverter.runUntilFinished()
  const pcbText = defaultConverter.getOutputString()

  expect(pcbText).toContain(
    '(model "${KIPRJMOD}/3dmodels/tscircuit_builtin.3dshapes/res0603.step"',
  )
  expect(defaultConverter.getModel3dSourcePaths()).toEqual([
    "https://modelcdn.tscircuit.com/jscad_models/res0603.step",
  ])

  const optOutConverter = new CircuitJsonToKicadPcbConverter(circuitJson, {
    includeBuiltin3dModels: false,
  })
  optOutConverter.runUntilFinished()
  expect(optOutConverter.getOutputString()).not.toContain("(model ")
})
