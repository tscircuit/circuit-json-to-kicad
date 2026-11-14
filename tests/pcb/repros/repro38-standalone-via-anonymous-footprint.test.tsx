import { expect, test } from "bun:test"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

/**
 * Standalone `<via>` elements must export only as KiCad vias.
 *
 * tscircuit gives each manually placed via a `pcb_component` whose
 * `source_component_id` points at a `source_manually_placed_via`, not a
 * `source_component`. The footprint stage used to convert that container into
 * an empty, reference-less `tscircuit:Unknown` footprint, which assembly tools
 * that build the BOM from footprints (CircuitHub, for example) listed as an
 * unresolved "NOREF" part.
 */
test("repro38: standalone vias should not export reference-less footprints", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="12mm" height="8mm" routingDisabled>
      <net name="GND" />
      <via
        name="V_STITCH_1"
        pcbX={-3}
        pcbY={1}
        holeDiameter="0.3mm"
        outerDiameter="0.45mm"
        connectsTo="net.GND"
      />
      <via
        name="V_STITCH_2"
        pcbX={-3}
        pcbY={-1}
        holeDiameter="0.3mm"
        outerDiameter="0.45mm"
        connectsTo="net.GND"
      />
      <resistor name="R1" pcbX={3} resistance="1k" footprint="0402" />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const kicadPcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb

  // Both vias are exported as real KiCad vias (this part already works).
  expect(kicadPcb.vias).toHaveLength(2)

  // The only footprint should be R1. Today two extra `tscircuit:Unknown`
  // footprints with no Reference are emitted, one per via.
  expect(
    kicadPcb.footprints.map((footprint) => ({
      libraryLink: footprint.libraryLink,
      reference:
        footprint.properties.find((property) => property.key === "Reference")
          ?.value ?? null,
    })),
  ).toEqual([{ libraryLink: "tscircuit:resistor_res0402", reference: "R1" }])
})
