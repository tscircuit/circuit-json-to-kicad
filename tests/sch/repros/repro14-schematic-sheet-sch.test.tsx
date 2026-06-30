import { expect, test } from "bun:test"
import { convertCircuitJsonToStackedSchematicSheetsSvg } from "circuit-to-svg"
import { mkdir, rm } from "node:fs/promises"
import { join } from "node:path"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { CircuitJsonToKicadProConverter } from "lib/project/CircuitJsonToKicadProConverter"
import { resolveKicadSchematicFiles } from "lib"
import sharp from "sharp"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
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

const stackKicadSnapshots = async (
  generatedFileContent: Record<string, Buffer>,
): Promise<Buffer> => {
  const pngEntries = Object.entries(generatedFileContent)
    .filter(([filename]) => filename.endsWith(".png"))
    .sort(([a], [b]) => {
      if (a === "circuit.png") return -1
      if (b === "circuit.png") return 1
      return a.localeCompare(b)
    })

  const metadata = await Promise.all(
    pngEntries.map(([, png]) => sharp(png).metadata()),
  )
  const maxWidth = Math.max(...metadata.map((item) => item.width ?? 0))
  const totalHeight = metadata.reduce((sum, item) => sum + (item.height ?? 0), 0)

  return sharp({
    create: {
      width: maxWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(
      pngEntries.map(([, png], index) => {
        const top = metadata
          .slice(0, index)
          .reduce((sum, item) => sum + (item.height ?? 0), 0)
        return { input: png, left: 0, top }
      }),
    )
    .png()
    .toBuffer()
}

test("repro14 schematic sheet snapshot", async () => {
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
  const schematicSheets = circuitJson.filter(
    (element) => element.type === "schematic_sheet",
  )

  expect(schematicSheets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "schematic_sheet",
        name: "Sheet 1",
        display_name: "Sheet 1",
        sheet_index: 0,
      }),
      expect.objectContaining({
        type: "schematic_sheet",
        name: "Sheet 2",
        display_name: "Sheet 2",
        sheet_index: 1,
      }),
    ]),
  )

  expect(schematicSheets.length).toBe(2)

  for (const schematicSheet of schematicSheets) {
    const schematicComponentsOnSheet = circuitJson.filter(
      (element) =>
        element.type === "schematic_component" &&
        element.schematic_sheet_id === schematicSheet.schematic_sheet_id,
    )

    expect(schematicComponentsOnSheet.length).toBeGreaterThan(0)
  }

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const kicadOutputFiles = converter.getOutputFiles(
    "repro14-schematic-sheet-sch.kicad_sch",
  )
  expect(Object.keys(kicadOutputFiles).sort()).toEqual([
    "Sheet_1.kicad_sch",
    "Sheet_2.kicad_sch",
    "repro14-schematic-sheet-sch.kicad_sch",
  ])
  expect(kicadOutputFiles["repro14-schematic-sheet-sch.kicad_sch"]).toContain(
    "Sheet_1.kicad_sch",
  )
  expect(kicadOutputFiles["repro14-schematic-sheet-sch.kicad_sch"]).toContain(
    "Sheet_2.kicad_sch",
  )
  expect(
    kicadOutputFiles["repro14-schematic-sheet-sch.kicad_sch"],
  ).not.toContain("R1")
  expect(
    kicadOutputFiles["repro14-schematic-sheet-sch.kicad_sch"],
  ).not.toContain("R2")
  expect(kicadOutputFiles["Sheet_1.kicad_sch"]).toContain("R1")
  expect(kicadOutputFiles["Sheet_1.kicad_sch"]).toContain("C1")
  expect(kicadOutputFiles["Sheet_1.kicad_sch"]).not.toContain("R2")
  expect(kicadOutputFiles["Sheet_2.kicad_sch"]).toContain("R2")
  expect(kicadOutputFiles["Sheet_2.kicad_sch"]).toContain("C2")
  expect(kicadOutputFiles["Sheet_2.kicad_sch"]).not.toContain("R1")

  const outputDir = "./debug-output/repro14-schematic-sheet-sch"
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })
  const proConverter = new CircuitJsonToKicadProConverter(circuitJson, {
    projectName: "circuit",
  })
  proConverter.runUntilFinished()
  const kicadProjectOutput = proConverter.getOutputString()
  expect(kicadProjectOutput).toContain('"circuit.kicad_sch"')

  const resolvedSchematicFiles: Record<string, string> = {}
  await resolveKicadSchematicFiles({
    circuitJson,
    schematicFilename: "circuit.kicad_sch",
    onSchematicFile: ({ outputPath, content }) => {
      resolvedSchematicFiles[outputPath] = content
    },
  })

  expect(Object.keys(resolvedSchematicFiles).sort()).toEqual([
    "Sheet_1.kicad_sch",
    "Sheet_2.kicad_sch",
    "circuit.kicad_sch",
  ])

  const projectOutputFiles = proConverter.getOutputFiles()
  expect(Object.keys(projectOutputFiles).sort()).toEqual([
    "circuit.kicad_pcb",
    "circuit.kicad_pro",
    "circuit.kicad_sch",
  ])
  const outputFiles = {
    ...projectOutputFiles,
    ...resolvedSchematicFiles,
  }
  for (const [filename, fileContent] of Object.entries(outputFiles)) {
    await Bun.write(join(outputDir, filename), fileContent)
  }

  const rootSnapshot = await takeKicadSnapshot({
    kicadFilePath: join(outputDir, "circuit.kicad_sch"),
    kicadFileType: "sch",
  })
  const sheet1Snapshot = await takeKicadSnapshot({
    kicadFilePath: join(outputDir, "Sheet_1.kicad_sch"),
    kicadFileType: "sch",
  })
  const sheet2Snapshot = await takeKicadSnapshot({
    kicadFilePath: join(outputDir, "Sheet_2.kicad_sch"),
    kicadFileType: "sch",
  })

  expect(rootSnapshot.exitCode).toBe(0)
  expect(sheet1Snapshot.exitCode).toBe(0)
  expect(sheet2Snapshot.exitCode).toBe(0)
  const kicadStackedSnapshot = await stackKicadSnapshots(
    rootSnapshot.generatedFileContent,
  )

  const circuitJsonSnapshot = await sharp(
    Buffer.from(
      convertCircuitJsonToStackedSchematicSheetsSvg(circuitJson, {
        width: 1200,
        height: 600,
      }),
    ),
  )
    .png()
    .toBuffer()

  const stackedSnapshot = await stackCircuitJsonKicadPngs(
    circuitJsonSnapshot,
    kicadStackedSnapshot,
  )

  expect(stackedSnapshot).toMatchPngSnapshot(import.meta.path)

  await Bun.write(
    "./debug-output/repro14-schematic-sheet-sch.stacked.png",
    stackedSnapshot,
  )
}, 10_000)
