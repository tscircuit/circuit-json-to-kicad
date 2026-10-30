import { expect, test } from "bun:test"
import { KicadPcb } from "kicadts"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("smd pad paste and mask layers follow circuit json", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm" routingDisabled>
      <chip
        name="U1"
        footprint={
          <footprint>
            <smtpad
              shape="rect"
              width={1}
              height={1}
              pcbX={-3}
              portHints={["pin1"]}
            />
            <smtpad
              shape="rect"
              width={1}
              height={1}
              pcbX={0}
              noSolderPaste
              portHints={["pin2"]}
            />
            <smtpad
              shape="rect"
              width={1}
              height={1}
              pcbX={3}
              coveredWithSolderMask
              portHints={["pin3"]}
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
  const pads = pcb.footprints[0]!.fpPads
  const layersOf = (n: string) =>
    pads.find((p) => p.number === n)!.layers?.layers ?? []

  expect(layersOf("1")).toEqual(["F.Cu", "F.Paste", "F.Mask"])
  expect(layersOf("2")).toEqual(["F.Cu", "F.Mask"])
  expect(layersOf("3")).toEqual(["F.Cu"])
})
