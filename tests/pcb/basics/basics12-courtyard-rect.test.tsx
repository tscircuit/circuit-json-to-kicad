import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("pcb_courtyard_rect is converted to KiCad fp_rect on courtyard layer", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <chip
        name="U1"
        footprint={
          <footprint>
            <platedhole
              portHints={["1"]}
              pcbX={0}
              pcbY={0}
              outerDiameter="5mm"
              holeDiameter="3mm"
              shape="circle"
            />
            <courtyardrect
              pcbX={0}
              pcbY={0}
              width={10}
              height={8}
              layer="top"
            />
            <courtyardrect
              pcbX={0}
              pcbY={0}
              width={10}
              height={8}
              layer="bottom"
            />
          </footprint>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as any[]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  // Verify the output contains fp_rect on courtyard layers
  expect(outputString).toContain("F.CrtYd")
  expect(outputString).toContain("B.CrtYd")
  expect(outputString).toContain("fp_rect")

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
  })

  expect(kicadSnapshot.exitCode).toBe(0)

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
