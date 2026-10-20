import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { KicadPcb } from "kicadts"

test("standalone holes and pads are excluded from pos files and the BOM", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="50mm" height="50mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={0} pcbY={0} />
      <hole pcbX={-20} pcbY={-20} diameter="3.2mm" />
      <smtpad pcbX={20} pcbY={20} shape="rect" width="1mm" height="1mm" />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const kicadPcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
  // Read the flags rather than the rendered `(attr ...)` line, which also
  // carries the footprint type once that is known.
  const excludedFrom = (libraryLinkPart: string) => {
    const attr = kicadPcb.footprints.find((footprint) =>
      footprint.libraryLink?.includes(libraryLinkPart),
    )?.attr
    return [attr?.excludeFromPosFiles ?? false, attr?.excludeFromBom ?? false]
  }

  // A mounting hole or a lone pad is not a part, so neither must reach a
  // pick-and-place file or a BOM generated from this board.
  expect(excludedFrom("hole_circle")).toEqual([true, true])
  expect(excludedFrom("smtpad")).toEqual([true, true])
  // R1 is a part, so it keeps neither flag.
  expect(excludedFrom("0402")).toEqual([false, false])
})
