import { expect, test } from "bun:test"
import "bun-match-svg"
import { convertCircuitJsonToSchematicSvg } from "circuit-to-svg"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { Circuit } from "tscircuit"

test("exports power rail net labels with global power flag, hidden pin names, and numbered #PWR references", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <capacitor
        name="C1"
        polarized
        capacitance="220uF"
        footprint="electrolytic_d10mm_p5mm"
        schX={-3}
        schY={0}
        pcbX={0}
        pcbY={0}
        connections={{ pin1: "net.V24", pin2: "net.GND" }}
      />
      <capacitor
        name="C2"
        capacitance="100nF"
        footprint="0603"
        schX={3}
        schY={0}
        pcbX={8}
        pcbY={0}
        connections={{ pin1: "net.V24", pin2: "net.GND" }}
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const parsed = parseKicadSch(output)

  const railLibSymbols = (parsed.libSymbols?.symbols ?? []).filter((sym) =>
    sym.libraryId?.startsWith("Custom:rail_"),
  )
  expect(railLibSymbols.length).toBeGreaterThanOrEqual(2)
  for (const libSymbol of railLibSymbols) {
    expect(libSymbol._sxPower?.getString()).toBe("(power global)")
  }

  const placedRailSymbols = (parsed.symbols ?? []).filter((sym: any) =>
    sym._sxLibId?.value?.startsWith("Custom:rail_"),
  )
  expect(placedRailSymbols).toHaveLength(4)
  for (const sym of placedRailSymbols) {
    const refProp = sym.properties.find((p) => p.key === "Reference")
    expect(refProp?.effects?.hiddenText).toBe(true)
  }

  const references = placedRailSymbols.map(
    (sym) => sym.properties.find((p) => p.key === "Reference")?.value,
  )
  expect(references).toEqual(["#PWR01", "#PWR02", "#PWR03", "#PWR04"])

  const values = placedRailSymbols
    .map((sym) => sym.properties.find((p) => p.key === "Value")?.value)
    .sort()
  expect(values).toEqual(["GND", "GND", "V24", "V24"])

  const svg = convertCircuitJsonToSchematicSvg(circuitJson as any)
  expect(svg).toMatchSvgSnapshot(import.meta.path)
}, 20_000)
