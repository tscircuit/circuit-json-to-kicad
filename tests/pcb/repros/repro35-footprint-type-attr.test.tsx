import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { KicadPcb } from "kicadts"

test("footprint type attr follows the pads", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="50mm" height="50mm">
      <chip name="U1" footprint="soic8" pcbX={-10} pcbY={0} />
      <resistor
        name="R1"
        resistance="1k"
        footprint="axial_p5.08mm"
        pcbX={10}
        pcbY={0}
      />
      <hole pcbX={0} pcbY={-20} diameter="3.2mm" />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const kicadPcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
  const typeOf = (libraryLinkPart: string) =>
    kicadPcb.footprints.find((footprint) =>
      footprint.libraryLink?.includes(libraryLinkPart),
    )?.attr?.type

  // KiCad reads a missing type as through-hole, so an SMD footprint without
  // one trips its "footprint type doesn't match pads" DRC check.
  expect(typeOf("soic8")).toBe("smd")
  expect(typeOf("axial")).toBe("through_hole")
  // A mounting hole has only an np_thru_hole pad and nothing to solder, so it
  // stays unspecified, as KiCad's own MountingHole footprints are.
  expect(typeOf("hole_circle")).toBeUndefined()
})
