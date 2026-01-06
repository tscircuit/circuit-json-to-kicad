import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadLibraryConverter } from "lib/kicad-library/CircuitJsonToKicadLibraryConverter"

test("footprints use ergonomic names with footprinter_string", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-5} />
      <capacitor name="C1" capacitance="1uF" footprint="0603" pcbX={0} />
      <chip name="SW1" footprint="soic8" pcbX={5} />
    </board>,
  )

  await circuit.renderUntilSettled()
  const json = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadLibraryConverter(json as any, {
    libraryName: "index",
  })
  converter.runUntilFinished()
  const output = converter.getOutput()

  const footprintNames = output.footprints.map((fp) => fp.footprintName)

  // Should use {type}_{footprinter_string} format
  expect(footprintNames).toContain("resistor_0402")
  expect(footprintNames).toContain("capacitor_0603")
  expect(footprintNames).toContain("chip_soic8")

  // Should NOT contain "simple_" prefix
  expect(footprintNames.some((n) => n.includes("simple_"))).toBe(false)

  // Should NOT contain source_component_id
  expect(footprintNames.some((n) => n.includes("source_component"))).toBe(false)
})
