import { expect, test } from "bun:test"
import { KicadPcb } from "kicadts"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("repro #585: component and standalone footprints retain physical types", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-5} />
      <pinheader name="J1" pinCount={2} pcbX={5} />
      <smtpad shape="rect" width={1} height={1} pcbX={-5} pcbY={5} />
      <platedhole
        shape="circle"
        holeDiameter={0.7}
        outerDiameter={1.4}
        pcbX={5}
        pcbY={5}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const output = converter.getOutputString()
  await Bun.write(
    "./debug-output/repro585-footprint-attributes.kicad_pcb",
    output,
  )
  const pcb = KicadPcb.parse(output)[0] as KicadPcb

  expect(pcb.footprints.map((fp) => fp.fpPads[0]?.padType)).toEqual([
    "smd",
    "thru_hole",
    "thru_hole",
    "smd",
  ])
  expect(pcb.footprints.map((fp) => fp.attr?.type)).toEqual([
    "smd",
    "through_hole",
    "through_hole",
    "smd",
  ])
})
