import { expect, test } from "bun:test"
import { convertCircuitJsonToStackedSchematicSheetsSvg } from "circuit-to-svg"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
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
  rootSnapshotFilename: string,
): Promise<Buffer> => {
  const pngEntries = Object.entries(generatedFileContent)
    .filter(([filename]) => filename.endsWith(".png"))
    .sort(([a], [b]) => {
      if (a === rootSnapshotFilename) return -1
      if (b === rootSnapshotFilename) return 1
      return a.localeCompare(b)
    })
  const metadata = await Promise.all(
    pngEntries.map(([, png]) => sharp(png).metadata()),
  )
  const maxWidth = Math.max(...metadata.map((item) => item.width ?? 0))
  const totalHeight = metadata.reduce(
    (sum, item) => sum + (item.height ?? 0),
    0,
  )

  return sharp({
    create: {
      width: maxWidth,
      height: totalHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(
      pngEntries.map(([, png], index) => ({
        input: png,
        left: 0,
        top: metadata
          .slice(0, index)
          .reduce((sum, item) => sum + (item.height ?? 0), 0),
      })),
    )
    .png()
    .toBuffer()
}

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

    // Circuit JSON renders all schematic sheets as one stacked SVG; KiCad plots
    // one root page plus one child-page PNG per referenced sheet.
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
    const kicadStackedSnapshot = await stackKicadSnapshots(
      kicadSnapshot.generatedFileContent,
      "repro14-schematic-sheet-output-files.png",
    )

    expect(
      stackCircuitJsonKicadPngs(circuitJsonSnapshot, kicadStackedSnapshot),
    ).toMatchPngSnapshot(import.meta.path)
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
}, 10_000)
