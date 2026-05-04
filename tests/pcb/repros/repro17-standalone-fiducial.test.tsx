import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test(
  "standalone fiducials export as KiCad SMT pads",
  async () => {
    const circuit = new Circuit()
    circuit.add(
      <board width="30mm" height="20mm">
        <fiducial
          name="FID1"
          padDiameter="1mm"
          soldermaskPullback="1mm"
          pcbX={-10}
          pcbY={-5}
        />
        <fiducial
          name="FID2"
          padDiameter="1mm"
          soldermaskPullback="1mm"
          pcbX={10}
          pcbY={5}
        />
      </board>,
    )

    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson()

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()

    const outputString = converter.getOutputString()

    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: outputString,
      kicadFileType: "pcb",
    })

    expect(
      stackCircuitJsonKicadPngs(
        await takeCircuitJsonSnapshot({
          circuitJson,
          outputType: "pcb",
        }),
        kicadSnapshot.generatedFileContent["temp_file.png"]!,
      ),
    ).toMatchPngSnapshot(import.meta.path)
  },
  { timeout: 120000 },
)
