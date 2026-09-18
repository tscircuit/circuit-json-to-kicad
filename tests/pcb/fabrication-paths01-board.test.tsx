import { expect, test } from "bun:test"
import { Fragment } from "react"
import { parseKicadPcb } from "kicadts"
import { Circuit } from "tscircuit-latest"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../fixtures/stackCircuitJsonKicadPngs"

test("board fabrication paths export without duplicating component paths", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={40} height={28} pcbX={3} pcbY={2} routingDisabled>
      {(["top", "bottom"] as const).map((layer, index) => (
        <Fragment key={layer}>
          <fabricationnotepath
            layer={layer}
            strokeWidth={0.2 + index * 0.1}
            route={[
              { x: -12, y: 8 - index * 10 },
              { x: -7, y: 11 - index * 10 },
              { x: -3, y: 7 - index * 10 },
            ]}
          />
          <fabricationnotepath
            layer={layer}
            strokeWidth={0.15}
            route={[
              { x: 0, y: 7 - index * 10 },
              { x: 4, y: 7 - index * 10 },
              { x: 3, y: 10 - index * 10 },
              { x: 0, y: 7 - index * 10 },
            ]}
          />
          <chip
            name={`U${index + 1}`}
            pcbX={11}
            pcbY={7 - index * 10}
            pcbRotation={90}
            layer={layer}
            footprint={
              <footprint>
                <smtpad shape="rect" width={1} height={1} portHints={["1"]} />
                <fabricationnotepath
                  layer={layer}
                  strokeWidth={0.25}
                  route={[
                    { x: -2, y: -2 },
                    { x: 2, y: -2 },
                    { x: 2, y: 2 },
                  ]}
                />
              </footprint>
            }
          />
        </Fragment>
      ))}
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const paths = circuitJson.filter(
    (e) => e.type === "pcb_fabrication_note_path",
  )
  const standalone = paths.filter((path) => !path.pcb_component_id)
  expect(standalone).toHaveLength(4)
  expect(paths).toHaveLength(6)
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const outputString = converter.getOutputString()
  const pcb = parseKicadPcb(outputString)
  const lines = pcb.graphicLines.filter((line) =>
    line.layer?.names.some((layer) => layer.endsWith(".Fab")),
  )
  expect(lines).toHaveLength(10)
  for (const path of standalone) {
    for (let index = 0; index < path.route.length - 1; index++) {
      const start = path.route[index]!
      const end = path.route[index + 1]!
      const matches = lines.filter(
        (line) =>
          Math.abs(line.start!.x - (100 + start.x)) < 0.0001 &&
          Math.abs(line.start!.y - (100 - start.y)) < 0.0001 &&
          Math.abs(line.end!.x - (100 + end.x)) < 0.0001 &&
          Math.abs(line.end!.y - (100 - end.y)) < 0.0001,
      )
      expect(matches).toHaveLength(1)
      expect(matches[0]!.layer?.names).toEqual([
        path.layer === "bottom" ? "B.Fab" : "F.Fab",
      ])
      expect(matches[0]!.width).toBeCloseTo(path.stroke_width)
    }
  }
  expect(pcb.footprints).toHaveLength(2)
  for (const footprint of pcb.footprints) {
    const ownedLines = footprint.fpLines.filter((line) =>
      line.layer?.names.some((layer) => layer.endsWith(".Fab")),
    )
    expect(ownedLines).toHaveLength(2)
    for (const line of ownedLines) expect(line.stroke?.width).toBeCloseTo(0.25)
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
