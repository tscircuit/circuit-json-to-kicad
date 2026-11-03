import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { applyToPoint } from "transformation-matrix"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const B = () => (
  <board width="14mm" height="18mm">
    <resistor name="R1" resistance="1k" footprint="0402" pcbX={-2} />
    <capacitor name="C1" capacitance="100nF" footprint="0402" pcbX={2} />
    <trace from=".R1 > .pin2" to=".C1 > .pin1" />
  </board>
)

export default function Repro813PanelEdgeCuts({
  panelizationMethod = "tab-routing",
}: {
  panelizationMethod?: "tab-routing" | "outline_routing"
}) {
  return (
    <panel
      layoutMode="grid"
      row={3}
      col={3}
      boardGap="2mm"
      panelizationMethod={panelizationMethod}
      tabLength="3mm"
    >
      {Array.from({ length: 9 }, (_, i) => (
        <B key={i} />
      ))}
    </panel>
  )
}

test("pcb repro813 panel Edge.Cuts match snapshots", async () => {
  for (const panelizationMethod of [
    "tab-routing",
    "outline_routing",
  ] as const) {
    const circuit = new Circuit()
    circuit.add(
      <Repro813PanelEdgeCuts panelizationMethod={panelizationMethod} />,
    )
    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson()
    const panel = circuitJson.find((element) => element.type === "pcb_panel")!
    const boards = circuitJson.filter((element) => element.type === "pcb_board")
    const cutouts = circuitJson.filter(
      (element) => element.type === "pcb_cutout",
    )

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()
    const edgeCuts = converter
      .getOutput()
      .graphicLines.filter((line) => line.layer?.names[0] === "Edge.Cuts")

    expect(boards).toHaveLength(9)
    expect(cutouts).toHaveLength(panelizationMethod === "tab-routing" ? 72 : 36)
    // Records #813: the export has only the first board's four edges.
    expect(edgeCuts).toHaveLength(4)

    // Keep the whole panel visible even when its Edge.Cuts are missing.
    const viewport = {
      minX: panel.center.x - panel.width / 2 - 2,
      maxX: panel.center.x + panel.width / 2 + 2,
      minY: panel.center.y - panel.height / 2 - 2,
      maxY: panel.center.y + panel.height / 2 + 2,
    }
    const topLeft = applyToPoint(converter.ctx.c2kMatPcb!, {
      x: viewport.minX,
      y: viewport.maxY,
    })
    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: converter.getOutputString(),
      kicadFileType: "pcb",
      pcbLayers: ["F.Cu", "F.SilkS", "Edge.Cuts"],
      pcbViewport: {
        x: topLeft.x,
        y: topLeft.y,
        width: viewport.maxX - viewport.minX,
        height: viewport.maxY - viewport.minY,
      },
    })
    const circuitJsonSvg = convertCircuitJsonToPcbSvg(circuitJson, {
      width: 600,
      height: 720,
      viewport,
      layer: "top",
    })
    await expect(
      stackCircuitJsonKicadPngs(
        await sharp(Buffer.from(circuitJsonSvg)).png().toBuffer(),
        await sharp(kicadSnapshot.generatedFileContent["temp_file.png"]!)
          .resize(600, 720)
          .png()
          .toBuffer(),
      ),
    ).toMatchPngSnapshot(import.meta.path, `repro813-${panelizationMethod}`)
  }
}, 30_000)
