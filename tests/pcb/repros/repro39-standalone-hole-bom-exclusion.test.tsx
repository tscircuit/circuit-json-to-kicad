import { expect, test } from "bun:test"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

/**
 * Known bug: standalone `<hole>` elements (e.g. mounting holes) are exported as
 * `tscircuit:hole_*` footprints with no Reference and no fabrication
 * attributes, so downstream tools treat them as parts to buy and place.
 *
 * KiCad's own MountingHole footprints carry a reference (`H1`, `H2`, ...) and
 * `(attr exclude_from_pos_files exclude_from_bom)`. The exported hole
 * footprints have neither: no Reference property and no `attr` at all.
 *
 * Impact: CircuitHub imports each mounting hole as an unresolved "NOREF" BOM
 * line (footprint `hole_circle_holeDiameter...`), and KiCad's own BOM and
 * position-file exports include them too.
 *
 * Marked `test.failing` because it asserts the correct behaviour; remove
 * `.failing` once hole footprints get a reference and the exclusion flags.
 */
test.failing("repro39: standalone hole footprints need a reference and BOM/position-file exclusion", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <hole name="MH_LEFT" pcbX={-7.7} pcbY={7.7} diameter="2.2mm" />
      <hole name="MH_RIGHT" pcbX={7.7} pcbY={7.7} diameter="2.2mm" />
      <resistor name="R1" resistance="1k" footprint="0402" />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const kicadPcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb

  const holeFootprints = kicadPcb.footprints.filter((footprint) =>
    footprint.libraryLink?.startsWith("tscircuit:hole_"),
  )
  expect(holeFootprints).toHaveLength(2)

  // Each mounting-hole footprint should look like KiCad's MountingHole:
  // a non-empty reference, excluded from the BOM and from position files.
  expect(
    holeFootprints.map((footprint) => ({
      hasReference: Boolean(
        footprint.properties.find((property) => property.key === "Reference")
          ?.value,
      ),
      excludeFromBom: footprint.attr?.excludeFromBom ?? false,
      excludeFromPosFiles: footprint.attr?.excludeFromPosFiles ?? false,
    })),
  ).toEqual([
    { hasReference: true, excludeFromBom: true, excludeFromPosFiles: true },
    { hasReference: true, excludeFromBom: true, excludeFromPosFiles: true },
  ])
})
