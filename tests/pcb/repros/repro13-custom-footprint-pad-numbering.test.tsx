import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { KicadPcb } from "kicadts"

test("custom footprint pads keep source pin identity (issue #212)", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled>
      <chip
        name="U1"
        pcbX={0}
        pcbY={0}
        pinLabels={{
          pin1: "P1",
          pin2: "P2",
          pin3: "P3",
          pin4: "P4",
        }}
        footprint={
          <footprint>
            <smtpad
              portHints={["pin4"]}
              pcbX="-3mm"
              pcbY="0mm"
              width="0.8mm"
              height="1.5mm"
              shape="rect"
            />
            <smtpad
              portHints={["pin3"]}
              pcbX="-1mm"
              pcbY="0mm"
              width="0.8mm"
              height="1.5mm"
              shape="rect"
            />
            <smtpad
              portHints={["pin2"]}
              pcbX="1mm"
              pcbY="0mm"
              width="0.8mm"
              height="1.5mm"
              shape="rect"
            />
            <smtpad
              portHints={["pin1"]}
              pcbX="3mm"
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

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()
  const kicadPcb = KicadPcb.parse(outputString)[0] as KicadPcb

  const u1 = kicadPcb.footprints[0]
  expect(u1).toBeDefined()

  // Map: KiCad pad number -> pad x position (in KiCad's Y-flipped frame)
  const padsByNumber = new Map(u1!.fpPads.map((p) => [p.number, p.at?.x ?? 0]))

  // pin4 sits at x = -3mm, pin3 at -1mm, pin2 at 1mm, pin1 at 3mm
  expect(padsByNumber.get("4")).toBeCloseTo(-3, 3)
  expect(padsByNumber.get("3")).toBeCloseTo(-1, 3)
  expect(padsByNumber.get("2")).toBeCloseTo(1, 3)
  expect(padsByNumber.get("1")).toBeCloseTo(3, 3)
})
