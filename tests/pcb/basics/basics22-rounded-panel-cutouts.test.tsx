import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { applyToPoint, compose, rotate, translate } from "transformation-matrix"
import { Circuit } from "tscircuit"
import { getKicadPcbDrc } from "../../fixtures/get-kicad-pcb-drc"
import { isPointInsideEdgeCuts } from "../../fixtures/is-point-inside-edge-cuts"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("preserves rounded slot ends on angled panel edges", async () => {
  const circuit = new Circuit()
  circuit.add(
    <panel
      width={30}
      height={26}
      panelizationMethod="tab-routing"
      tabLength={3}
    >
      <board
        outline={[
          { x: -10, y: 0 },
          { x: 0, y: -8 },
          { x: 10, y: 0 },
          { x: 0, y: 8 },
        ]}
        routingDisabled
        schematicDisabled
      />
    </panel>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const edges = converter
    .getOutput()
    .graphicLines.filter((line) => line.layer?.names[0] === "Edge.Cuts")
  const cutouts = circuitJson.filter((element) => element.type === "pcb_cutout")
  expect(cutouts).toHaveLength(8)
  for (const [index, cutout] of cutouts.entries()) {
    if (cutout.shape !== "rect") throw new Error("Expected rectangular cutout")
    const radius = cutout.corner_radius!
    expect(radius).toBeGreaterThan(0)
    expect(radius).toBeCloseTo(cutout.height / 2)
    expect(Math.abs((cutout.rotation ?? 0) % 90)).toBeGreaterThan(1)
    const toKicad = compose(
      converter.ctx.c2kMatPcb!,
      translate(cutout.center.x, cutout.center.y),
      rotate(((cutout.rotation ?? 0) * Math.PI) / 180),
    )
    const inside = (x: number, y: number) =>
      isPointInsideEdgeCuts(edges, applyToPoint(toKicad, { x, y }))
    expect(inside(0, 0)).toBe(false)
    // Each edge has two slots separated by a tab. Check the rounded end
    // facing the tab, away from the overlap at the board's corner.
    const endSign = index % 2 === 0 ? 1 : -1
    for (const sideSign of [-1, 1]) {
      // A square-ended cutout would incorrectly remove this material.
      expect(
        inside(
          endSign * (cutout.width / 2 - radius * 0.1),
          sideSign * (cutout.height / 2 - radius * 0.1),
        ),
      ).toBe(true)
      expect(
        inside(
          endSign * (cutout.width / 2 - radius / 2),
          sideSign * (cutout.height / 2 - radius / 2),
        ),
      ).toBe(false)
    }
  }
  const output = converter.getOutputString()
  const report = await getKicadPcbDrc(output)
  expect(
    report.violations.filter((v) => v.type === "invalid_outline"),
  ).toHaveLength(0)
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    pcbViewport: {
      ...applyToPoint(converter.ctx.c2kMatPcb!, { x: -17, y: 15 }),
      width: 34,
      height: 30,
    },
  })
  const circuitJsonSvg = convertCircuitJsonToPcbSvg(circuitJson, {
    width: 680,
    height: 600,
    viewport: { minX: -17, minY: -15, maxX: 17, maxY: 15 },
  })
  await expect(
    stackCircuitJsonKicadPngs(
      await sharp(Buffer.from(circuitJsonSvg)).png().toBuffer(),
      await sharp(snapshot.generatedFileContent["temp_file.png"]!)
        .resize(680, 600)
        .png()
        .toBuffer(),
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
