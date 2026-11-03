import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { applyToPoint } from "transformation-matrix"
import { Circuit } from "tscircuit"
import { getKicadPcbDrc } from "../../fixtures/get-kicad-pcb-drc"
import { isPointInsideEdgeCuts } from "../../fixtures/is-point-inside-edge-cuts"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("exports disjoint boards with a custom outline and a cutout", async () => {
  const circuit = new Circuit()
  circuit.add(<board width={10} height={8} routingDisabled schematicDisabled />)
  circuit.add(
    <board
      pcbX={40}
      outline={[
        { x: 34, y: -5 },
        { x: 44, y: -5 },
        { x: 46, y: -3 },
        { x: 46, y: 3 },
        { x: 44, y: 5 },
        { x: 34, y: 5 },
      ]}
      routingDisabled
      schematicDisabled
    >
      <cutout shape="circle" radius={1} pcbX={-3} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const edges = converter
    .getOutput()
    .graphicLines.filter((line) => line.layer?.names[0] === "Edge.Cuts")
  const boards = circuitJson.filter((element) => element.type === "pcb_board")
  expect(boards).toHaveLength(2)
  const inside = (point: { x: number; y: number }) =>
    isPointInsideEdgeCuts(edges, applyToPoint(converter.ctx.c2kMatPcb!, point))
  for (const board of boards) expect(inside(board.center)).toBe(true)
  expect(inside({ x: 25, y: 0 })).toBe(false)
  // The clipped corners of the second board must not become a rectangle.
  expect(inside({ x: 45.5, y: 4.5 })).toBe(false)
  const cutout = circuitJson.find(
    (element) => element.type === "pcb_cutout" && element.shape === "circle",
  )!
  expect(cutout.shape).toBe("circle")
  if (cutout.shape === "circle") expect(inside(cutout.center)).toBe(false)

  const output = converter.getOutputString()
  const report = await getKicadPcbDrc(output)
  expect(
    report.violations.filter((v) => v.type === "invalid_outline"),
  ).toHaveLength(0)
  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    pcbViewport: {
      ...applyToPoint(converter.ctx.c2kMatPcb!, { x: -20, y: 15 }),
      width: 70,
      height: 30,
    },
  })
  const circuitJsonSvg = convertCircuitJsonToPcbSvg(circuitJson, {
    width: 840,
    height: 360,
    viewport: { minX: -20, minY: -15, maxX: 50, maxY: 15 },
  })
  await expect(
    stackCircuitJsonKicadPngs(
      await sharp(Buffer.from(circuitJsonSvg)).png().toBuffer(),
      await sharp(kicadSnapshot.generatedFileContent["temp_file.png"]!)
        .resize(840, 360)
        .png()
        .toBuffer(),
    ),
  ).toMatchPngSnapshot(import.meta.path, "basics21-disjoint-boards")
}, 30_000)
