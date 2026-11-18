import { expect, test } from "bun:test"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

// KiCad moves every footprint field to the back layers when a part is
// flipped. Bottom parts used to keep Reference on F.SilkS and Value,
// Datasheet, Description, etc. on F.Fab.
test("bottom footprint properties use back layers", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm" routingDisabled schematicDisabled>
      <resistor
        name="R1"
        resistance="1k"
        footprint="0402"
        layer="bottom"
        manufacturerPartNumber="RC0402FR-071KL"
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const pcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
  const footprint = pcb.footprints[0]!

  expect(footprint.layer?.names[0]).toBe("B.Cu")
  expect(
    footprint.properties.map((property) => [
      property.key,
      property.layer?.names[0],
    ]),
  ).toMatchInlineSnapshot(`
    [
      [
        "Reference",
        "B.SilkS",
      ],
      [
        "Value",
        "B.Fab",
      ],
      [
        "Datasheet",
        "B.Fab",
      ],
      [
        "Description",
        "B.Fab",
      ],
      [
        "Supplier Part Number",
        "B.Fab",
      ],
      [
        "MPN",
        "B.Fab",
      ],
    ]
  `)
})
