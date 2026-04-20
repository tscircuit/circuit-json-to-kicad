import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { CircuitJsonToKicadProConverter } from "lib/project/CircuitJsonToKicadProConverter"
import circuitJson from "tests/assets/motor-controller.json"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("motor controller pcb", async () => {
  const proConverter = new CircuitJsonToKicadProConverter(circuitJson as any, {
    projectName: "motor-controller",
    schematicFilename: "motor-controller.kicad_sch",
    pcbFilename: "motor-controller.kicad_pcb",
  })
  proConverter.runUntilFinished()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson as any)

  converter.runUntilFinished()

  Bun.write(
    "./debug-output/motor-controller.kicad_pro",
    proConverter.getOutputString(),
  )
  Bun.write(
    "./debug-output/motor-controller.kicad_pcb",
    converter.getOutputString(),
  )

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "pcb",
  })

  expect(kicadSnapshot.exitCode).toBe(0)
})
