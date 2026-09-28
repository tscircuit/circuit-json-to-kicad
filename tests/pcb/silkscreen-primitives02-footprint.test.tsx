import { expect, test } from "bun:test"
import { parseKicadPcb } from "kicadts"
import { Circuit } from "tscircuit-latest"
import {
  applyToPoint,
  compose,
  rotateDEG,
  translate,
} from "transformation-matrix"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"

test("silkscreen lines remain attached to rotated footprints on both sides", async () => {
  const circuit = new Circuit()
  const rotations = [0, 90, 180, 270]
  const layers = ["top", "bottom"] as const
  circuit.add(
    <board width={40} height={24} routingDisabled>
      {layers.flatMap((layer, row) =>
        rotations.map((rotation, column) => (
          <chip
            key={`${layer}-${rotation}`}
            name={`U${row * 4 + column + 1}`}
            pcbX={-15 + column * 10}
            pcbY={6 - row * 12}
            pcbRotation={rotation}
            layer={layer}
            footprint={
              <footprint>
                <smtpad
                  pcbX={0}
                  pcbY={0}
                  width={1}
                  height={1}
                  shape="rect"
                  portHints={["1"]}
                />
                <silkscreenline
                  x1={-2}
                  y1={-1}
                  x2={3}
                  y2={2}
                  strokeWidth={0.3}
                />
                <silkscreentext
                  text={`${layer} ${rotation}`}
                  pcbX={0}
                  pcbY={-3}
                  fontSize={0.7}
                />
              </footprint>
            }
          />
        )),
      )}
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const sourceLines = circuitJson.filter(
    (entry) => entry.type === "pcb_silkscreen_line",
  )
  expect(sourceLines).toHaveLength(8)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const outputString = converter.getOutputString()
  const pcb = parseKicadPcb(outputString)
  expect(pcb.footprints).toHaveLength(8)
  expect(
    pcb.graphicLines.filter((line) =>
      line.layer?.names.some((layer) => layer.endsWith(".SilkS")),
    ),
  ).toHaveLength(0)

  for (const sourceLine of sourceLines) {
    const sourceComponent = circuitJson.find(
      (entry) =>
        entry.type === "pcb_component" &&
        entry.pcb_component_id === sourceLine.pcb_component_id,
    )
    if (!sourceComponent || sourceComponent.type !== "pcb_component")
      throw new Error("Missing owning PCB component")
    const footprint = pcb.footprints.find(
      (footprint) =>
        Math.abs(footprint.position!.x - (100 + sourceComponent.center.x)) <
          0.0001 &&
        Math.abs(footprint.position!.y - (100 - sourceComponent.center.y)) <
          0.0001,
    )!
    expect(footprint.fpLines).toHaveLength(1)
    const line = footprint.fpLines[0]!
    expect(line.layer?.names).toEqual([
      sourceLine.layer === "top" ? "F.SilkS" : "B.SilkS",
    ])
    expect(line.stroke?.width).toBeCloseTo(sourceLine.stroke_width)

    // KiCad footprint coordinates are local millimetres, +X right, +Y down.
    // Recover board coordinates from the emitted placement and compare with
    // the source geometry (including the bottom-side mirror already in it).
    const footprintCcwRotationDegrees =
      "angle" in footprint.position! ? (footprint.position.angle ?? 0) : 0
    const localToBoard = compose(
      translate(footprint.position!.x, footprint.position!.y),
      rotateDEG(-footprintCcwRotationDegrees),
    )
    const boardStart = applyToPoint(localToBoard, line.start!)
    const boardEnd = applyToPoint(localToBoard, line.end!)
    expect(boardStart.x).toBeCloseTo(100 + sourceLine.x1)
    expect(boardStart.y).toBeCloseTo(100 - sourceLine.y1)
    expect(boardEnd.x).toBeCloseTo(100 + sourceLine.x2)
    expect(boardEnd.y).toBeCloseTo(100 - sourceLine.y2)
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
