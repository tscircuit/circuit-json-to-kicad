import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { KicadPcb } from "kicadts"

test("custom inline footprint should have correct Reference (issue #227)", async () => {
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
              width="0.8mm"
              height="1.5mm"
              shape="rect"
            />
            <smtpad
              portHints={["2"]}
              pcbX="1mm"
              pcbY="0mm"
              width="0.8mm"
              height="1.5mm"
              shape="rect"
            />
          </footprint>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  console.log(
    "Circuit JSON sample:",
    JSON.stringify(circuitJson.slice(0, 3), null, 2),
  )

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()
  const kicadPcb = KicadPcb.parse(outputString)[0] as KicadPcb

  const u1 = kicadPcb.footprints[0]
  expect(u1).toBeDefined()

  // Find Reference property
  const refProp = u1.properties?.find((p) => p.key === "Reference")
  console.log("Reference property:", refProp?.value)

  expect(outputString).toContain('(property "Reference" "U_TEST"')
})
