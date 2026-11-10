import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"
import { readSchematicErc } from "../fixtures/read-schematic-erc"
import { createConnectedGridBoxes } from "../fixtures/connection-grid-boxes"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"

const spacing = 0.01

test(`custom symbol grid placement preserves two separate nets at ${spacing} pin spacing`, async () => {
  const circuitJson = await createConnectedGridBoxes({ spacing })
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const schematic = converter.getOutput()
  const definitions = schematic.libSymbols!.symbols
  expect(definitions).toHaveLength(2)
  // U2 and U3 still share one library definition at different sheet positions.
  expect(schematic.symbols[1]!.libraryId).toBe(schematic.symbols[2]!.libraryId)
  for (const symbol of schematic.symbols) {
    const datasheet = symbol.properties.find(
      (property) => property.key === "Datasheet",
    )!
    expect(datasheet.at!.x).toBe(symbol.at!.x)
    expect(datasheet.at!.y).toBe(symbol.at!.y)
  }
  for (const definition of definitions) {
    const body = definition.subSymbols.flatMap((unit) => unit.rectangles)[0]!
    expect(body.getString()).toContain("(start -7.5 -4.5)")
    expect(body.getString()).toContain("(end 7.5 4.5)")
    const pins = definition.subSymbols.flatMap((unit) => unit.pins)
    for (const pin of pins) {
      expect(Math.abs(pin.at!.x) - pin.length!).toBeCloseTo(7.5, 4)
    }
    expect(Math.abs(pins[0]!.at!.y - pins[1]!.at!.y)).toBeGreaterThanOrEqual(
      1.27,
    )
  }
  const nets = await exportNativeSchematicNets(circuitJson)
  expect(
    nets
      .filter((net) => net.pins.length > 1)
      .map((net) => net.pins)
      .sort(),
  ).toEqual([
    ["U1.1", "U2.1", "U3.1"],
    ["U1.2", "U2.2"],
  ])
  expect(nets.find((net) => net.name === "A")?.pins).toEqual([
    "U1.1",
    "U2.1",
    "U3.1",
  ])
  expect(
    nets.find((net) => net.name === "unconnected-(U3-Pad2)")?.pins,
  ).toEqual(["U3.2"])
  expect(nets.find((net) => net.name === "/B")?.pins).toEqual(["U1.2", "U2.2"])

  expect(
    (await readSchematicErc(converter.getOutputString())).filter(
      (type) => type !== "lib_symbol_issues",
    ),
  ).toEqual([])
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })
  await expect(
    snapshot.generatedFileContent["temp_file.png"]!,
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
