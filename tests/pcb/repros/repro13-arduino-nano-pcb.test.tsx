import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("pcb repro13 arduino nano import top/bottom snapshots", async () => {
  const kicadFilePath = join(
    import.meta.dir,
    "../../assets/arduino-nano.kicad_pcb",
  )
  const kicadFileContent = await readFile(kicadFilePath, "utf8")

  const converter = new KicadToCircuitJsonConverter()
  converter.addFile("arduino-nano.kicad_pcb", kicadFileContent)
  converter.runUntilFinished()

  const circuitJson = converter.getOutput() as Array<{
    type: string
    layer?: "top" | "bottom"
  }>

  Bun.write(
    "./debug-output/arduino-nano.converted.circuit.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const pcbComponents = circuitJson.filter(
    (element) => element.type === "pcb_component",
  )

  expect(
    pcbComponents.filter((element) => element.layer === "top").length,
  ).toBeGreaterThan(0)
  expect(
    pcbComponents.filter((element) => element.layer === "bottom").length,
  ).toBeGreaterThan(0)

  for (const layer of ["top", "bottom"] as const) {
    const kicadSnapshot = await takeKicadSnapshot({
      kicadFilePath,
      kicadFileType: "pcb",
      layer,
    })

    expect(kicadSnapshot.exitCode).toBe(0)

    expect(
      stackCircuitJsonKicadPngs(
        await takeCircuitJsonSnapshot({
          circuitJson: circuitJson as any,
          outputType: "pcb",
          layer,
        }),
        kicadSnapshot.generatedFileContent["temp_file.png"]!,
        {
          circuitJsonLabel: `Circuit JSON (${layer})`,
          kicadLabel: `KiCad (${layer})`,
        },
      ),
    ).toMatchPngSnapshot(import.meta.path, `repro13-arduino-nano-pcb-${layer}`)
  }
})
