import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("pcb_silkscreen_rect is converted to KiCad fp_rect inside footprint (not board-level gr_rect)", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <chip
        name="U1"
        footprint={
          <footprint>
            <smtpad
              portHints={["1"]}
              pcbX={0}
              pcbY={0}
              width="1mm"
              height="1mm"
              shape="rect"
            />
            <silkscreenrect
              pcbX={0}
              pcbY={0}
              width={4}
              height={3}
              layer="top"
            />
            <silkscreenrect
              pcbX={0}
              pcbY={0}
              width={4}
              height={3}
              layer="bottom"
            />
          </footprint>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as any[]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  // Must use fp_rect (inside footprint), NOT gr_rect (board-level)
  expect(outputString).toContain("fp_rect")
  expect(outputString).not.toContain("gr_rect")

  // Both top and bottom silkscreen layers must be present
  expect(outputString).toContain("F.SilkS")
  expect(outputString).toContain("B.SilkS")
})
