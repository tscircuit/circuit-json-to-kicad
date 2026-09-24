import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

const convert = async (element: any) => {
  const circuit = new Circuit()
  circuit.add(element)
  const circuitJson = await circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson as any)
  converter.runUntilFinished()
  return converter.getOutputString()
}

test("an unparseable hole diameter does not emit NaN into the kicad_pcb", async () => {
  const output = await convert(
    <board width="10mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0402" />
      <hole name="H1" diameter={"abc" as any} pcbX={2} pcbY={2} />
    </board>,
  )

  expect(output).not.toContain("NaN")
  expect(output).toContain("(drill 1)")
})

test("an unparseable via hole diameter does not emit NaN", async () => {
  const output = await convert(
    <board width="10mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0402" />
      <via
        name="V1"
        holeDiameter={"abc" as any}
        outerDiameter="0.6mm"
        pcbX={2}
        pcbY={2}
      />
    </board>,
  )

  expect(output).not.toContain("NaN")
  // The via keeps its valid outer diameter and falls back only for the drill.
  expect(output).toContain("(size 0.6)")
  expect(output).toContain("(drill 0.4)")
})

test("an unparseable plated hole diameter does not emit NaN", async () => {
  const output = await convert(
    <board width="10mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0402" />
      <platedhole
        name="P1"
        holeDiameter={"abc" as any}
        outerDiameter="1mm"
        pcbX={2}
        pcbY={2}
        shape="circle"
      />
    </board>,
  )

  expect(output).not.toContain("NaN")
})

test("valid hole and via dimensions are still written verbatim", async () => {
  const output = await convert(
    <board width="10mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0402" />
      <hole name="H1" diameter="2.5mm" pcbX={2} pcbY={2} />
      <via
        name="V1"
        holeDiameter="0.3mm"
        outerDiameter="0.7mm"
        pcbX={-2}
        pcbY={-2}
      />
    </board>,
  )

  expect(output).not.toContain("NaN")
  // Real values must survive — the guard must not clamp everything to a default.
  expect(output).toContain("(drill 2.5)")
  expect(output).toContain("(drill 0.3)")
  expect(output).toContain("(size 0.7)")
})
