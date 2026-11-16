import { expect, test } from "bun:test"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

/**
 * A component can export a different reference than its name through KiCad
 * footprint metadata. Standalone holes must not reuse a reference a component
 * was exported with: here R1 exports as `H1`, so the holes become `H2` and
 * `H3`, and every footprint reference on the board stays unique.
 */
test("repro40: standalone hole references skip references components were exported with", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <hole name="MH_LEFT" pcbX={-7.7} pcbY={7.7} diameter="2.2mm" />
      <hole name="MH_RIGHT" pcbX={7.7} pcbY={7.7} diameter="2.2mm" />
      <resistor
        name="R1"
        resistance="1k"
        footprint="0402"
        kicadFootprintMetadata={{ properties: { Reference: { value: "H1" } } }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const kicadPcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb

  const references = kicadPcb.footprints.map((footprint) => ({
    libraryLink: footprint.libraryLink,
    reference: footprint.properties.find(
      (property) => property.key === "Reference",
    )?.value,
  }))
  expect(references).toEqual([
    { libraryLink: "tscircuit:resistor_res0402", reference: "H1" },
    {
      libraryLink: "tscircuit:hole_circle_holeDiameter2.2mm",
      reference: "H2",
    },
    {
      libraryLink: "tscircuit:hole_circle_holeDiameter2.2mm",
      reference: "H3",
    },
  ])
})
