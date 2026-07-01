import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import {
  getCircuitJsonForSchematicSheet,
  getSchematicSheetFiles,
} from "lib/schematic/schematicSheetFiles"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const SheetCircuit = ({
  resistorName,
  capacitorName,
  capacitance,
  ...props
}: any) => (
  <subcircuit {...props}>
    <resistor
      name={resistorName}
      resistance="1k"
      footprint="0402"
      schX={-1.5}
      schY={0}
    />
    <capacitor
      name={capacitorName}
      capacitance={capacitance}
      footprint="0402"
      schX={1.5}
      schY={0}
    />
    <trace from={`.${resistorName} > .pin2`} to={`.${capacitorName} > .pin1`} />
  </subcircuit>
)

test("repro14 schematic sheet snapshots", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <schematicsheet name="Sheet 1" displayName="Sheet 1" sheetIndex={0} />
      <schematicsheet name="Sheet 2" displayName="Sheet 2" sheetIndex={1} />

      <SheetCircuit
        name="MAIN1"
        schSheetName="Sheet 1"
        resistorName="R1"
        capacitorName="C1"
        capacitance="100nF"
      />
      <SheetCircuit
        name="MAIN2"
        schSheetName="Sheet 2"
        resistorName="R2"
        capacitorName="C2"
        capacitance="1uF"
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as any[]
  const schematicFilename = "repro14-schematic-sheet-output-files.kicad_sch"
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const outputDir = await mkdtemp(
    join(tmpdir(), "repro14-schematic-sheet-output-files-"),
  )

  try {
    for (const { filename, content } of converter.getOutputFiles({
      schematicFilename,
    })) {
      await Bun.write(join(outputDir, filename), content)
    }

    const kicadSnapshot = await takeKicadSnapshot({
      kicadFilePath: join(outputDir, schematicFilename),
      kicadFileType: "sch",
    })

    // takeKicadSnapshot opens the root .kicad_sch file, then KiCad plots one
    // PNG for the root page and one PNG for each child sheet file referenced by
    // the root. We snapshot the root page by itself, then stack each child
    // sheet's Circuit JSON rendering above the matching KiCad child-page PNG.
    await expect(
      kicadSnapshot.generatedFileContent[
        "repro14-schematic-sheet-output-files.png"
      ]!,
    ).toMatchPngSnapshot(
      import.meta.path,
      "repro14-schematic-sheet-output-files-root",
    )

    for (const [index, sheetFile] of getSchematicSheetFiles(
      circuitJson,
    ).entries()) {
      const circuitJsonPng = await takeCircuitJsonSnapshot({
        circuitJson: getCircuitJsonForSchematicSheet(
          circuitJson,
          sheetFile.schematicSheetId,
        ),
        outputType: "schematic",
      })
      const kicadPng =
        kicadSnapshot.generatedFileContent[
          `repro14-schematic-sheet-output-files-${sheetFile.displayName}.png`
        ]!

      await expect(
        stackCircuitJsonKicadPngs(circuitJsonPng, kicadPng),
      ).toMatchPngSnapshot(
        import.meta.path,
        `repro14-schematic-sheet-output-files-sheet-${index + 1}`,
      )
    }
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
}, 10_000)
