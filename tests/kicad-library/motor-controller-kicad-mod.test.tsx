import { expect, test } from "bun:test"
import { CircuitJsonToKicadModConverter } from "lib/footprint/CircuitJsonToKicadModConverter"
import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import circuitJson from "../assets/motor-controller.json"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import "../fixtures/png-matcher"

const customFootprintName = "TYPE_C_31_M_12"

test(
  "circuit json exports motor-controller footprints as .kicad_mod files",
  async () => {
    const converterWithoutName = new CircuitJsonToKicadModConverter(
      circuitJson as any,
      {
        libraryName: "motor-controller",
        footprintLibraryName: "motor-controller",
      },
    )
    converterWithoutName.runUntilFinished()

    expect(() => converterWithoutName.getOutputString()).toThrow(
      /Pass footprintName to CircuitJsonToKicadModConverter/,
    )

    const converter = new CircuitJsonToKicadModConverter(circuitJson as any, {
      libraryName: "motor-controller",
      footprintLibraryName: "motor-controller",
      footprintName: customFootprintName,
    })
    converter.runUntilFinished()

    const output = converter.getOutput()
    expect(output.footprintName).toBe(customFootprintName)

    const kicadModString = converter.getOutputString()
    const outputPath = join(
      process.cwd(),
      "debug-output",
      `${customFootprintName}.kicad_mod`,
    )
    await mkdir(dirname(outputPath), { recursive: true })
    await Bun.write(outputPath, kicadModString)

    expect(kicadModString).toContain(`"${customFootprintName}"`)
    expect(kicadModString).toContain("(pad")

    const footprintSnapshot = await takeKicadSnapshot({
      kicadFileContent: kicadModString,
      kicadFileType: "mod",
    })

    expect(footprintSnapshot.exitCode).toBe(0)
    expect(Object.keys(footprintSnapshot.generatedFileContent)).toHaveLength(1)

    const [pngBuffer] = Object.values(footprintSnapshot.generatedFileContent)
    expect(pngBuffer).toBeDefined()
    await expect(pngBuffer!).toMatchPngSnapshot(
      import.meta.path,
      customFootprintName,
    )
  },
  { timeout: 60000 },
)
