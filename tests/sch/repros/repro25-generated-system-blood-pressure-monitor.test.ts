import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { runGeneratedSystemRepro } from "../../fixtures/run-generated-system-repro"

test("repro25: convert the blood pressure monitor multisheet generated system", async () => {
  await runGeneratedSystemRepro({
    fixtureUrl: new URL(
      "../../assets/repro25-generated-system-blood-pressure-monitor.circuit.json",
      import.meta.url,
    ),
    rootFilename: "blood_pressure_monitor.kicad_sch",
    snapshotPath: import.meta.path,
    debugOutputName:
      "repro25-generated-system-blood-pressure-monitor.stacked.png",
    sheetComparisonLayout: "vertical",
    expectedSheetNames: [
      "Input + Reference",
      "Connectors + Jumpers + Test Points",
      "Programming",
      "INA + Filter",
      "MCU",
      "Pressure Sensor + ADC Filter",
      "Motor Driver",
    ],
    assertKicadSchematicFiles: (files) => {
      const programmingSheet = parseKicadSch(
        files.find(({ filename }) => filename === "programming.kicad_sch")!
          .content,
      )
      const switchInstance = programmingSheet.symbols.find((symbol) =>
        symbol.properties.some(
          (property) => property.key === "Reference" && property.value === "S1",
        ),
      )!
      const switchDefinition = programmingSheet.libSymbols!.symbols.find(
        (symbol) => symbol.libraryId === switchInstance.libraryId,
      )!
      const switchPins = switchDefinition.subSymbols.flatMap(
        (symbol) => symbol.pins,
      )
      expect(switchPins).toHaveLength(2)
      const wirePoints = programmingSheet.wires.flatMap(
        (wire) => wire.points?.points ?? [],
      )
      for (const pin of switchPins) {
        // KiCad library Y is up, while the placed schematic Y is down.
        const x = switchInstance.at!.x + pin.at!.x
        const y = switchInstance.at!.y - pin.at!.y
        expect(
          wirePoints.some(
            (point) =>
              "x" in point &&
              Math.abs(point.x - x) < 1e-4 &&
              Math.abs(point.y - y) < 1e-4,
          ),
        ).toBe(true)
      }

      const connectorsSheet = files.find(
        ({ filename }) => filename === "interfaces.kicad_sch",
      )
      expect(connectorsSheet).toBeDefined()

      const groundSymbols = parseKicadSch(
        connectorsSheet!.content,
      ).symbols.filter(
        (symbol: any) => symbol._sxLibId?.value === "Custom:rail_down",
      )
      // One GND symbol belongs to J3 and one to TP7. The unassigned root-page
      // label must not be copied into this child sheet as a second TP7 symbol.
      expect(groundSymbols).toHaveLength(2)
    },
  })
}, 120_000)
