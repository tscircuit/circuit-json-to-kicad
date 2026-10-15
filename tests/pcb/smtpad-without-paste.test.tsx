import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("bottom component pads without source paste omit B.Paste", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={10} height={10} routingDisabled>
      <resistor name="R1" resistance="1k" footprint="0402" layer="bottom" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(
    circuit
      .getCircuitJson()
      .filter((element) => element.type !== "pcb_solder_paste"),
  )
  converter.runUntilFinished()
  const pcb = parseKicadPcb(converter.getOutputString())
  expect(
    pcb.footprints
      .flatMap((footprint) => footprint.fpPads)
      .map((pad) => pad.layers?.layers),
  ).toEqual([
    ["B.Cu", "B.Mask"],
    ["B.Cu", "B.Mask"],
  ])
})
