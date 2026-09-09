import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("repro14 schematic rect schematic", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="10mm" height="10mm">
      <schematicrect
        schX={0}
        schY={0}
        width={2}
        height={1.5}
        isFilled={false}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  await Bun.write(
    "./debug-output/repro14-schematic-rect-sch.circuit.json",
    JSON.stringify(circuitJson, null, 2),
  )

  const converter = new CircuitJsonToKicadSchConverter(circuitJson as any)
  converter.runUntilFinished()

  const output = converter.getOutputString()
  await Bun.write("./debug-output/repro14-schematic-rect-sch.kicad_sch", output)

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
    "./debug-output/repro14-schematic-rect-sch.stacked.png",
    stackedSnapshot,
  )

  await expect(stackedSnapshot).toMatchPngSnapshot(import.meta.path)
}, 10_000)
