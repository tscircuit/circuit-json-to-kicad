import { expect, test } from "bun:test"
import { createSmdPadPasteAndMaskRepro } from "../../fixtures/smd-pad-paste-and-mask-repro"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test(
  "repro37: paste and mask layer snapshot",
  async () => {
    const { circuitJson, kicadPcbString } =
      await createSmdPadPasteAndMaskRepro()
    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: kicadPcbString,
      kicadFileType: "pcb",
      pcbLayers: ["F.Cu", "F.Mask", "F.Paste", "Edge.Cuts"],
    })
    expect(kicadSnapshot.exitCode).toBe(0)
    expect(
      await stackCircuitJsonKicadPngs(
        await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
        kicadSnapshot.generatedFileContent["temp_file.png"]!,
      ),
    ).toMatchPngSnapshot(import.meta.path)
  },
  { timeout: 120000 },
)
