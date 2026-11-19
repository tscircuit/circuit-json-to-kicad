import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { Circuit } from "tscircuit"

test("DNP follows the individual schematic symbol without excluding it from the BOM or board", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <resistor name="R1" resistance="1k" footprint="0402" doNotPlace />
      <resistor name="R2" resistance="1k" footprint="0402" schX={3} />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const { symbols } = parseKicadSch(converter.getOutputString())
  const flagsByReference = Object.fromEntries(
    symbols.map((symbol) => [
      symbol.properties.find((property) => property.key === "Reference")?.value,
      { dnp: symbol.dnp, inBom: symbol.inBom, onBoard: symbol.onBoard },
    ]),
  )
  expect(flagsByReference).toEqual({
    R1: { dnp: true, inBom: true, onBoard: true },
    R2: { dnp: false, inBom: true, onBoard: true },
  })
})
