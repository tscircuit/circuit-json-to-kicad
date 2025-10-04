import { test, expect } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import circuitJson from "tests/assets/usb.json"

test("pcb basics01", async () => {
  Bun.write(
    "./debug-output/pcb-circuit.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const converter = new CircuitJsonToKicadSchConverter(circuitJson as any)

  converter.runUntilFinished()

  Bun.write("./debug-output/kicad.kicad_sch", converter.getOutputString())

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson: circuitJson as any,
        outputType: "schematic",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
