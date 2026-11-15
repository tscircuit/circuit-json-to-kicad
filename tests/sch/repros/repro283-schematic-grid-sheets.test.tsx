import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit"

test("grid alignment applies independently to hierarchical child sheets", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board routingDisabled>
      {["Power", "Logic"].map((name, index) => (
        <schematicsheet name={name} displayName={name} sheetIndex={index}>
          <resistor
            name={`R${index + 1}`}
            resistance="1k"
            schX={0.137}
            schY={0.219}
          />
          <netlabel
            net="LINK"
            schX={-2.383}
            schY={2.193}
            connectsTo={`.R${index + 1} > .pin1`}
          />
        </schematicsheet>
      ))}
    </board>,
  )
  await circuit.renderUntilSettled()
  const options = { schematicGridSize: 0.25, paperSize: undefined }
  const converter = new CircuitJsonToKicadSchConverter(
    circuit.getCircuitJson(),
    options,
  )
  converter.runUntilFinished()
  const files = converter.getOutputFiles({
    schematicFilename: "grid.kicad_sch",
  })
  expect(files).toHaveLength(3)
  for (const file of files.slice(1)) {
    const sheet = parseKicadSch(file.content)
    expect(sheet.globalLabels).toHaveLength(1)
    for (const anchor of [...sheet.symbols, ...sheet.globalLabels]) {
      for (const coordinate of [anchor.at!.x, anchor.at!.y]) {
        expect(coordinate / 0.25).toBeCloseTo(Math.round(coordinate / 0.25), 6)
      }
    }
  }
})
