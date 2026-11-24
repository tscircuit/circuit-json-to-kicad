import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("plated holes keep solder mask coverage and margin", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <chip
        name="U1"
        footprint={
          <footprint>
            <platedhole
              shape="circle"
              holeDiameter="1mm"
              outerDiameter="2mm"
              portHints={["1"]}
              pcbX={-2}
              coveredWithSolderMask
            />
            <platedhole
              shape="circle"
              holeDiameter="1mm"
              outerDiameter="2mm"
              portHints={["2"]}
              pcbX={2}
              solderMaskMargin={0.2}
            />
          </footprint>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(
    circuit.getCircuitJson() as CircuitJson,
  )
  converter.runUntilFinished()
  const pcb = parseKicadPcb(converter.getOutputString())
  const pads = pcb.footprints.flatMap((footprint) => footprint.fpPads)
  const coveredPad = pads.find((pad) => pad.number === "1")!
  const marginPad = pads.find((pad) => pad.number === "2")!

  // A tented hole has copper on every layer but no solder mask opening
  expect(coveredPad.layers?.layers).toEqual(["*.Cu"])
  expect(marginPad.layers?.layers).toEqual(["*.Cu", "*.Mask"])
  expect(marginPad.solderMaskMargin).toBe(0.2)
})
