import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import sharp from "sharp"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import fixture from "./fixtures/repro21-connector-missing-symbol.json"

test("repro21: generic connector instance has no embedded symbol definition", async () => {
  const circuitJson = fixture as CircuitJson
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const schematic = parseKicadSch(output)
  const connector = schematic.symbols.find((symbol) =>
    symbol.properties.some(
      (property) => property.key === "Reference" && property.value === "J3",
    ),
  )
  expect(connector).toBeDefined()
  expect(connector!.pins).toHaveLength(6)
  const libraryId = connector!.libraryId
  expect(libraryId).toBeDefined()
  // Capture the existing defect: the instance references a missing library symbol.
  expect(schematic.libSymbols!.getString()).not.toContain(
    `(symbol "${libraryId}"`,
  )
  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
    fitSchematicToContent: true,
  })
  expect(kicadSnapshot.exitCode).toBe(0)
  const circuitJsonPng = await sharp(
    await takeCircuitJsonSnapshot({
      circuitJson,
      outputType: "schematic",
    }),
  )
    .resize(1200, 600, { fit: "contain", background: "#f5f1ed" })
    .png()
    .toBuffer()
  await expect(
    stackCircuitJsonKicadPngs(
      circuitJsonPng,
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 60_000)
