import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib"
import { Circuit } from "tscircuit"
import { getNativePcbDrc } from "../../fixtures/get-native-pcb-drc"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

export const PanelEdgeCutsRepro = () => (
  <panel
    layoutMode="grid"
    row={3}
    col={3}
    boardGap="2mm"
    panelizationMethod="tab-routing"
    tabLength="3mm"
  >
    {Array.from({ length: 9 }, (_, boardIndex) => (
      <board
        key={boardIndex}
        width="14mm"
        height="18mm"
        routingDisabled
        schematicDisabled
      >
        <resistor name="R1" resistance="1k" footprint="0402" />
      </board>
    ))}
  </panel>
)

export default PanelEdgeCutsRepro

test("panel Edge.Cuts include every board and form a valid manufacturing outline", async () => {
  const circuit = new Circuit()
  circuit.add(<PanelEdgeCutsRepro />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const panel = circuitJson.find((element) => element.type === "pcb_panel")!
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const nativeReport = await getNativePcbDrc(output)
  const nativeSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
  })
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      nativeSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)

  const edgePoints = converter
    .getOutput()
    .graphicLines.filter((line) => line.layer?.names[0] === "Edge.Cuts")
    .flatMap((line) => [line.start!, line.end!])
  const width =
    Math.max(...edgePoints.map((position) => position.x)) -
    Math.min(...edgePoints.map((position) => position.x))
  const height =
    Math.max(...edgePoints.map((position) => position.y)) -
    Math.min(...edgePoints.map((position) => position.y))
  expect({ width, height }).toEqual({
    width: panel.width,
    height: panel.height,
  })
  expect(
    nativeReport.violations.filter(
      (violation) => violation.type === "invalid_outline",
    ),
  ).toHaveLength(0)
})
