import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("pcb repro04 joule thief", async () => {
  const kicadFilePath = join(
    import.meta.dir,
    "../../assets/joule-thief.kicad_pcb",
  )
  const kicadFileContent = await readFile(kicadFilePath, "utf8")

  const converter = new KicadToCircuitJsonConverter()
  converter.addFile("joule-thief.kicad_pcb", kicadFileContent)
  converter.runUntilFinished()

  const circuitJson = converter.getOutput()

  Bun.write(
    "./debug-output/joule-thief.converted.circuit.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFilePath,
    kicadFileType: "pcb",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson: circuitJson as any,
        outputType: "pcb",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
