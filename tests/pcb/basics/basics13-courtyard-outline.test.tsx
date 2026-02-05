import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("pcb_courtyard_outline is converted to KiCad fp_poly on courtyard layer", async () => {
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
            <courtyardoutline
              outline={[
                { x: -5, y: -4 },
                { x: 0, y: -6 },
                { x: 5, y: -4 },
                { x: 5, y: 4 },
                { x: 0, y: 6 },
                { x: -5, y: 4 },
                { x: -5, y: -4 },
              ]}
              layer="top"
            />
            <courtyardoutline
              outline={[
                { x: -3, y: -5 },
                { x: 3, y: -5 },
                { x: 6, y: 0 },
                { x: 3, y: 5 },
                { x: -3, y: 5 },
                { x: -6, y: 0 },
                { x: -3, y: -5 },
              ]}
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

  expect(outputString).toContain("F.CrtYd")
  expect(outputString).toContain("B.CrtYd")
  expect(outputString).toContain("fp_poly")

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
