import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import circuitJson from "tests/assets/autorouting-dataset-01.json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("pcb repro24 autorouting dataset snapshot", async () => {
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson as any)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()
  const parsedPcb = parseKicadPcb(outputString)

  expect(outputString).toContain("(filled_polygon")
  expect(parsedPcb.zones.length).toBeGreaterThan(0)
  expect(parsedPcb.zones.every((zone) => zone.filledPolygons.length > 0)).toBe(
    true,
  )

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
  })

  expect(kicadSnapshot.exitCode).toBe(0)
  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "pcb",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
