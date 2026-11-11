import { expect, test } from "bun:test"
import { createPlatedHoleRoundedPadRepro } from "../../fixtures/plated-hole-rounded-pad-repro"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test(
  "repro38: 555 board rounded pin 1 snapshot",
  async () => {
    const { circuitJson, kicadPcbString } =
      await createPlatedHoleRoundedPadRepro()
    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: kicadPcbString,
      kicadFileType: "pcb",
      pcbDrillHoleColor: "white",
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
