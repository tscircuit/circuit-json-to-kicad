import { expect, test } from "bun:test"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("hint-derived pad number does not collide with a real pin number (#212 fallback)", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled>
      <chip
        name="U1"
        pcbX={0}
        pcbY={0}
        footprint={
          <footprint>
            <smtpad
              portHints={["pin1"]}
              pcbX="-1mm"
              pcbY="0mm"
              width="0.3mm"
              height="0.3mm"
              shape="rect"
            />
            <smtpad
              portHints={["1"]}
              pcbX="1mm"
              pcbY="0mm"
              width="0.3mm"
              height="0.3mm"
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

  const padNumbers = u1!.fpPads.map((p) => p.number)

  // Two physically separate, unconnected pads must never share a pad
  // number: the second pad's "1"-looking internal hint must not be
  // mistaken for the real pin 1 held by the first pad.
  expect(new Set(padNumbers).size).toBe(padNumbers.length)
  expect(padNumbers).toContain("1")
})
