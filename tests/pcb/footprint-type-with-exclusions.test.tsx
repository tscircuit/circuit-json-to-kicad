import { expect, test } from "bun:test"
import { KicadPcb } from "kicadts"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("infers footprint type without replacing exclusion attributes", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm" routingDisabled>
      <resistor
        name="R1"
        resistance="1k"
        footprint="0402"
        kicadFootprintMetadata={{
          attributes: {
            exclude_from_bom: true,
            exclude_from_pos_files: true,
          },
        }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const pcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
  const attr = pcb.footprints[0]!.attr

  expect(attr?.type).toBe("smd")
  expect(attr?.excludeFromBom).toBe(true)
  expect(attr?.excludeFromPosFiles).toBe(true)
})
