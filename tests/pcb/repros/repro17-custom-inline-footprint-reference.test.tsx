import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { KicadPcb } from "kicadts"

/**
 * Regression test for issue #227:
 * Components using a custom inline <footprint> prop export to .kicad_pcb
 * with an empty Reference property. The component name must be propagated
 * to (property "Reference" ...) in the output.
 */
test("repro227: custom inline footprint has non-empty Reference designator", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled>
      <chip
        name="U_TEST"
        pcbX={0}
        pcbY={0}
        footprint={
          <footprint>
            <smtpad
              portHints={["1"]}
              pcbX="-1mm"
              pcbY="0mm"
              width="0.6mm"
              height="1mm"
              shape="rect"
            />
            <smtpad
              portHints={["2"]}
              pcbX="1mm"
              pcbY="0mm"
              width="0.6mm"
              height="1mm"
              shape="rect"
            />
          </footprint>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  // The Reference property must not be empty
  const referenceMatch = outputString.match(/\(property\s+"Reference"\s+"([^"]*)"/)
  expect(referenceMatch).toBeTruthy()
  expect(referenceMatch![1]).not.toBe("")

  // The Reference should contain the component name "U_TEST"
  const kicadPcb = KicadPcb.parse(outputString)[0] as KicadPcb
  const u1 = kicadPcb.footprints[0]
  expect(u1).toBeDefined()

  const refProp = u1!.properties?.find((p: any) => p.key === "Reference")
  expect(refProp?.value).toBeTruthy()
  expect(refProp?.value).toBe("U_TEST")
})
