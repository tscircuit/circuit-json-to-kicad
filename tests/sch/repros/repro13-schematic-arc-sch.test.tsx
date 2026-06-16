import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import circuitJson from "../../assets/repro13-schematic-arc-sch.circuit.json"

test("repro13 schematic arc schematic", async () => {
  await Bun.write(
    "./debug-output/repro13-schematic-arc-sch.circuit.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const converter = new CircuitJsonToKicadSchConverter(circuitJson as any)
  converter.runUntilFinished()

  const output = converter.getOutputString()
  await Bun.write("./debug-output/repro13-schematic-arc-sch.kicad_sch", output)

  expect(output).toContain("(arc")

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  const stackedSnapshot = await stackCircuitJsonKicadPngs(
    await takeCircuitJsonSnapshot({
      circuitJson: circuitJson as any,
      outputType: "schematic",
    }),
    kicadSnapshot.generatedFileContent["temp_file.png"]!,
  )

  await Bun.write(
    "./debug-output/repro13-schematic-arc-sch.stacked.png",
    stackedSnapshot,
  )

  await expect(stackedSnapshot).toMatchPngSnapshot(import.meta.path)
})
