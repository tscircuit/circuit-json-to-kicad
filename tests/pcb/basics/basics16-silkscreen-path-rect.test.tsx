import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

test("pcb_silkscreen_path and pcb_silkscreen_rect are exported as footprint primitives, not board-level graphics", async () => {
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
              outerDiameter="3mm"
              holeDiameter="1.5mm"
              shape="circle"
            />
            <silkscreenpath
              route={[
                { x: -2, y: -2 },
                { x: 2, y: -2 },
                { x: 2, y: 2 },
                { x: -2, y: 2 },
                { x: -2, y: -2 },
              ]}
              layer="top"
            />
            <silkscreenrect
              pcbX={0}
              pcbY={0}
              width={6}
              height={4}
              layer="top"
            />
          </footprint>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson() as any[]

  // Verify circuit-json has the silkscreen elements with pcb_component_id
  const silkscreenPaths = circuitJson.filter(
    (e) => e.type === "pcb_silkscreen_path",
  )
  const silkscreenRects = circuitJson.filter(
    (e) => e.type === "pcb_silkscreen_rect",
  )
  expect(silkscreenPaths.length).toBeGreaterThan(0)
  expect(silkscreenRects.length).toBeGreaterThan(0)
  expect(silkscreenPaths[0].pcb_component_id).toBeTruthy()
  expect(silkscreenRects[0].pcb_component_id).toBeTruthy()

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const outputString = converter.getOutputString()

  // Silkscreen path should be fp_line inside the footprint, not gr_line at board level
  expect(outputString).toContain("fp_line")
  expect(outputString).toContain("F.SilkS")

  // Silkscreen rect should be fp_rect inside the footprint
  expect(outputString).toContain("fp_rect")

  // Component-owned silkscreen paths should NOT appear as board-level gr_line on SilkS
  // (gr_line on Edge.Cuts is expected for the board outline)
  const grLines = outputString
    .split("\n")
    .filter((line) => line.includes("gr_line") && line.includes("SilkS"))
  expect(grLines.length).toBe(0)

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
