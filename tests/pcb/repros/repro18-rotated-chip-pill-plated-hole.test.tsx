import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

const Repro18RotatedChipPillPlatedHole = () => (
  <board width="11mm" height="11mm">
    <chip
      pcbRotation={-90}
      name="U1"
      footprint={
        <footprint>
          <platedhole
            portHints={["pin13"]}
            pcbX="-4.324985mm"
            pcbY="1.57511755mm"
            pcbRotation={270}
            holeWidth="0.5999988mm"
            holeHeight="1.499997mm"
            outerWidth="1.0999978mm"
            outerHeight="1.999996mm"
            shape="pill"
          />
        </footprint>
      }
    />
  </board>
)

export default Repro18RotatedChipPillPlatedHole

test("pcb repro18 rotated chip pill plated hole", async () => {
  const circuit = new Circuit()
  circuit.add(<Repro18RotatedChipPillPlatedHole />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
    pcbDrillHoleColor: "white",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "pcb",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
      { kicadCanvasHeight: 180 },
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
