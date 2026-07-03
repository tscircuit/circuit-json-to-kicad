import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"

// A design with no <schematicsheet> must keep the original single-file behavior.
test("no schematic sheets -> single flat file with no sheet nodes", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <resistor name="R1" resistance="10k" footprint="0402" schX={0} schY={0} />
      <capacitor
        name="C1"
        capacitance="1uF"
        footprint="0402"
        schX={3}
        schY={0}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const files = converter.getOutputFiles({
    schematicFilename: "flat.kicad_sch",
  })
  expect(files.length).toBe(1)
  expect(files[0]!.filename).toBe("flat.kicad_sch")

  const sch = parseKicadSch(converter.getOutputString())
  expect(sch.symbols.length).toBe(2)
  expect(sch.sheets.length).toBe(0)

  // Symbol instance paths remain the single-segment root form: /<rootUuid>
  const rootUuid = sch.uuid!.value
  for (const sym of sch.symbols) {
    const path = (sym as any)._sxInstances?.projects?.[0]?.paths?.[0]?.value
    expect(path).toBe(`/${rootUuid}`)
  }
})
