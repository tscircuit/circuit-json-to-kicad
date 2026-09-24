import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { Circuit } from "tscircuit-latest"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"

test("standalone silkscreen lines and circles survive KiCad export on both layers", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={24} height={16} pcbX={5} pcbY={3} routingDisabled>
      <chip
        name="U1"
        pcbX={-7}
        pcbY={-1}
        footprint={
          <footprint>
            <smtpad width={0.6} height={0.6} shape="rect" portHints={["1"]} />
            <silkscreencircle radius={0.8} strokeWidth={0.1} />
          </footprint>
        }
      />
      <silkscreentext text="TOP" pcbX={0} pcbY={5} fontSize={1} />
      <silkscreenline x1={-4} y1={3} x2={1} y2={1} strokeWidth={0.3} />
      <silkscreencircle pcbX={5} pcbY={2} radius={2} strokeWidth={0.25} />
      <silkscreentext
        text="BOTTOM"
        pcbX={0}
        pcbY={-1}
        fontSize={1}
        layer="bottom"
      />
      <silkscreenline
        x1={-4}
        y1={-3}
        x2={1}
        y2={-5}
        strokeWidth={0.2}
        layer="bottom"
      />
      <silkscreencircle
        pcbX={5}
        pcbY={-4}
        radius={1.5}
        strokeWidth={0.4}
        layer="bottom"
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const sourceLines = circuitJson.filter(
    (entry) => entry.type === "pcb_silkscreen_line",
  )
  const sourceCircles = circuitJson
    .filter((entry) => entry.type === "pcb_silkscreen_circle")
    .filter((circle) => !circle.pcb_component_id)
  expect(sourceLines).toHaveLength(2)
  expect(sourceCircles).toHaveLength(2)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const outputString = converter.getOutputString()
  const pcb = parseKicadPcb(outputString)
  const silkLines = pcb.graphicLines.filter((line) =>
    line.layer?.names.some((layer) => layer.endsWith(".SilkS")),
  )
  expect(silkLines).toHaveLength(2)
  expect(pcb.graphicCircles).toHaveLength(2)
  expect(pcb.footprints).toHaveLength(1)
  expect(pcb.footprints[0]!.fpCircles).toHaveLength(1)

  // CircuitJsonToKicadPcbConverter maps world (x, y) mm to (100 + x, 100 - y).
  for (const sourceLine of sourceLines) {
    const layer = sourceLine.layer === "top" ? "F.SilkS" : "B.SilkS"
    const exportedLine = silkLines.find((line) =>
      line.layer?.names.includes(layer),
    )!
    expect(exportedLine.start?.x).toBeCloseTo(100 + sourceLine.x1)
    expect(exportedLine.start?.y).toBeCloseTo(100 - sourceLine.y1)
    expect(exportedLine.end?.x).toBeCloseTo(100 + sourceLine.x2)
    expect(exportedLine.end?.y).toBeCloseTo(100 - sourceLine.y2)
    expect(exportedLine.width).toBeCloseTo(sourceLine.stroke_width)
  }
  for (const sourceCircle of sourceCircles) {
    const layer = sourceCircle.layer === "top" ? "F.SilkS" : "B.SilkS"
    const exportedCircle = pcb.graphicCircles.find((circle) =>
      circle.layer?.names.includes(layer),
    )!
    expect(exportedCircle.center?.x).toBeCloseTo(100 + sourceCircle.center.x)
    expect(exportedCircle.center?.y).toBeCloseTo(100 - sourceCircle.center.y)
    expect(
      Math.hypot(
        exportedCircle.end!.x - exportedCircle.center!.x,
        exportedCircle.end!.y - exportedCircle.center!.y,
      ),
    ).toBeCloseTo(sourceCircle.radius)
    expect(exportedCircle.width).toBeCloseTo(sourceCircle.stroke_width)
  }

  const snapshot = await takeKicadSnapshot({
    kicadFileContent: outputString,
    kicadFileType: "pcb",
  })
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      snapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 31_000)
