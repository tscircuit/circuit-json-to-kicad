import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadLibraryConverter } from "lib"
import type { CircuitJson } from "circuit-json"

test("CircuitJsonToKicadLibraryConverter.convert returns footprint entries", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-3} pcbY={0} />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0603"
        pcbX={3}
        pcbY={0}
        connections={{ pin1: "R1.pin2" }}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const footprints = CircuitJsonToKicadLibraryConverter.convert(
    circuit.getCircuitJson() as CircuitJson,
    {
      libraryName: "test_library",
      footprintLibraryName: "test_library",
    },
  ).getFootprints()

  expect(footprints.length).toBeGreaterThanOrEqual(2)

  for (const footprint of footprints) {
    expect(footprint.footprintName.length).toBeGreaterThan(0)
    expect(footprint.kicadModString).toContain("(footprint")
    expect(footprint.kicadModString).toContain("(pad")
  }

  expect(footprints.some((fp) => fp.footprintName.includes("resistor"))).toBe(
    true,
  )
  expect(footprints.some((fp) => fp.footprintName.includes("capacitor"))).toBe(
    true,
  )
})
