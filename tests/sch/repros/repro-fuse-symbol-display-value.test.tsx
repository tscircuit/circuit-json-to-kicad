import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro: fuse symbol display value is preserved in KiCad", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board>
      <fuse
        name="F1"
        currentRating="3A"
        voltageRating="125V"
        schX={0}
        schY={0}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const schematicComponent = circuitJson.find(
    (element) =>
      element.type === "schematic_component" &&
      element.symbol_display_value === "3A / 125V",
  )
  expect(schematicComponent).toBeDefined()

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()
  const parsedSchematic = parseKicadSch(output)
  const fuseSymbol = parsedSchematic.symbols.find((symbol) =>
    symbol.properties.some(
      (property) => property.key === "Reference" && property.value === "F1",
    ),
  )
  const valueProperty = fuseSymbol?.properties.find(
    (property) => property.key === "Value",
  )

  expect(valueProperty?.value).toBe("3A / 125V")

  Bun.write("./debug-output/repro-fuse-symbol-display-value.kicad_sch", output)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })
  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "schematic",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
