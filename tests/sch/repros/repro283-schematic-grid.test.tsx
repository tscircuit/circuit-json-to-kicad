import { expect, test } from "bun:test"
import { parseKicadSch, Xy } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { createSchematicGridCircuit } from "../../fixtures/create-schematic-grid-circuit"
import { getNativeSchematicNetGroups } from "../../fixtures/get-native-schematic-net-groups"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test.failing("repro283: electrical anchors export on the requested KiCad grid", async () => {
  const circuitJson = await createSchematicGridCircuit()
  const originalCircuitJson = JSON.stringify(circuitJson)
  const gridOptions = { schematicGridSize: 0.25, paperSize: undefined }
  const converter = new CircuitJsonToKicadSchConverter(circuitJson, gridOptions)
  converter.runUntilFinished()
  const content = converter.getOutputString()
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: content,
    kicadFileType: "sch",
  })
  expect(snapshot.exitCode).toBe(0)
  expect(snapshot.generatedFileContent["temp_file.png"]!).toMatchPngSnapshot(
    import.meta.path,
  )
  expect(JSON.stringify(circuitJson)).toBe(originalCircuitJson)
  const schematic = parseKicadSch(content)
  const checkGrid = (coordinate: number) => {
    expect(coordinate / gridOptions.schematicGridSize).toBeCloseTo(
      Math.round(coordinate / gridOptions.schematicGridSize),
      6,
    )
  }
  // These are the coordinates KiCad reads, after serialization and parsing.
  for (const wire of schematic.wires) {
    for (const point of wire.points?.points ?? []) {
      if (point instanceof Xy) {
        checkGrid(point.x)
        checkGrid(point.y)
      }
    }
  }
  expect(schematic.globalLabels.length).toBeGreaterThan(0)
  for (const anchor of [...schematic.globalLabels, ...schematic.junctions]) {
    checkGrid(anchor.at!.x)
    checkGrid(anchor.at!.y)
  }
  for (const symbol of schematic.symbols) {
    checkGrid(symbol.at!.x)
    checkGrid(symbol.at!.y)
    const library = schematic.libSymbols!.symbols.find(
      (s) => s.libraryId === symbol.libraryId,
    )!
    for (const unit of library.subSymbols) {
      for (const pin of unit.pins) {
        checkGrid(symbol.at!.x + pin.at!.x)
        checkGrid(symbol.at!.y - pin.at!.y)
      }
    }
  }
  const netGroups = await getNativeSchematicNetGroups(content)
  expect(netGroups).toContainEqual(["L1.2", "R1.1", "R3.1"])
  expect(netGroups).toContainEqual(["L2.2", "R2.1"])
}, 30_000)
