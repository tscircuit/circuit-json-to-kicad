import { test, expect } from "bun:test"
import * as path from "node:path"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("pcb output contains expected model block for cadModel positionOffset", async () => {
  const stepPath = path.resolve(
    __dirname,
    "../assets/SW_Push_1P1T_NO_CK_KMR2.step",
  )

  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm">
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
        footprint="pushbutton"
        pcbY={-14}
        pcbX={-3}
        cadModel={
          <cadmodel
            modelUrl={stepPath}
            stepUrl={stepPath}
            rotationOffset={{ x: 0, y: 0, z: 0 }}
            positionOffset={{ x: 0, y: -2.85, z: 0 }}
          />
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson as any, {
    includeBuiltin3dModels: true,
    projectName: "index",
  })
  pcbConverter.runUntilFinished()
  const pcbString = pcbConverter.getOutputString()

  expect(
    pcbString,
  ).toContain(`(model "\${KIPRJMOD}/3dmodels/index.3dshapes/SW_Push_1P1T_NO_CK_KMR2.step"
      (offset
        (xyz 0 -2.8500000000000014 0)
      )
      (rotate
        (xyz 0 0 0)
      )
    )`)
})
