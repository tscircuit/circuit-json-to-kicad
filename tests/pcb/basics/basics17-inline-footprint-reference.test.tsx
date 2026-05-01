import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("pcb inline footprint has fp_text reference", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="50mm" height="50mm">
      <chip
        name="U1"
        pcbX={0}
        pcbY={0}
        footprint={
          <footprint>
            <smtpad
              pcbX={-1.27}
              pcbY={0}
              width="0.6mm"
              height="1.5mm"
              shape="rect"
              portHints={["1"]}
            />
            <smtpad
              pcbX={0}
              pcbY={0}
              width="0.6mm"
              height="1.5mm"
              shape="rect"
              portHints={["2"]}
            />
            <smtpad
              pcbX={1.27}
              pcbY={0}
              width="0.6mm"
              height="1.5mm"
              shape="rect"
              portHints={["3"]}
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

  const output = converter.getOutputString()

  // Verify the output contains fp_text reference with the component name "U1"
  // KiCad s-expression format puts these on separate lines
  expect(output).toContain('fp_text\n      reference\n      "U1"')
})
