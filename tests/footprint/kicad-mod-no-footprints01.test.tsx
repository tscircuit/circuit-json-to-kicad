import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadModConverter } from "lib/footprint/CircuitJsonToKicadModConverter"

test("zero footprints reports that none were generated, not that there were multiple", () => {
  const converter = new CircuitJsonToKicadModConverter([] as any)
  converter.runUntilFinished()

  expect(() => converter.getOutput()).toThrow(/No footprints were generated/)
  // The old message claimed the opposite of what happened.
  expect(() => converter.getOutput()).not.toThrow(/Multiple footprints/)

  // Same for the other two public entry points, which both route through getOutput().
  expect(() => converter.getOutputString()).toThrow(
    /No footprints were generated/,
  )
  expect(() => converter.getModel3dSourcePaths()).toThrow(
    /No footprints were generated/,
  )
})

test("a requested footprintName on an empty circuit also reports zero footprints", () => {
  const converter = new CircuitJsonToKicadModConverter([] as any, {
    footprintName: "res0402",
  })
  converter.runUntilFinished()

  expect(() => converter.getOutput()).toThrow(/No footprints were generated/)
  // Previously this said `not found. Available footprints: ` with an empty list.
  expect(() => converter.getOutput()).not.toThrow(/not found/)
})

test("two footprints still report the multiple-footprints error", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-5} />
      <capacitor name="C1" capacitance="1uF" footprint="0603" pcbX={5} />
    </board>,
  )
  const circuitJson = await circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadModConverter(circuitJson as any)
  converter.runUntilFinished()

  expect(() => converter.getOutput()).toThrow(
    /Multiple footprints were generated/,
  )
  expect(() => converter.getOutput()).toThrow(/resistor_res0402/)
})

test("a single footprint still converts", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0402" />
    </board>,
  )
  const circuitJson = await circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadModConverter(circuitJson as any)
  converter.runUntilFinished()

  expect(converter.getOutputString()).toContain("(footprint")
})
