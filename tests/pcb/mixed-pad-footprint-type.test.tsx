import { expect, test } from "bun:test"
import { KicadPcb } from "kicadts"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("plated pads take precedence over SMD pads for mixed footprints", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm" routingDisabled>
      <chip
        name="J1"
        footprint={
          <footprint>
            <smtpad
              shape="rect"
              width={1}
              height={1}
              pcbX={-2}
              portHints={["pin1"]}
            />
            <platedhole
              shape="circle"
              holeDiameter={0.7}
              outerDiameter={1.4}
              pcbX={2}
              portHints={["pin2"]}
            />
          </footprint>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const pcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb

  expect(pcb.footprints[0]?.attr?.type).toBe("through_hole")
})
