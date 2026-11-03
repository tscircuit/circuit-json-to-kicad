import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { applyToPoint, compose, rotate, translate } from "transformation-matrix"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { getKicadPcbDrc } from "../../fixtures/get-kicad-pcb-drc"
import { isPointInsideEdgeCuts } from "../../fixtures/is-point-inside-edge-cuts"

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
    const holes = circuitJson.filter((element) => element.type === "pcb_hole")

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()
    const edgeCuts = converter
      .getOutput()
      .graphicLines.filter((line) => line.layer?.names[0] === "Edge.Cuts")

    expect(boards).toHaveLength(9)
    expect(cutouts).toHaveLength(panelizationMethod === "tab-routing" ? 72 : 36)
    expect(holes).toHaveLength(panelizationMethod === "tab-routing" ? 72 : 0)
    const exportedHoles = converter
      .getOutput()
      .footprints.flatMap((footprint) =>
        footprint.fpPads
          .filter((pad) => pad.padType === "np_thru_hole")
          .map((pad) => ({
            x: footprint.position!.x + pad.at!.x,
            y: footprint.position!.y + pad.at!.y,
            pad,
          })),
      )
    expect(exportedHoles).toHaveLength(holes.length)
    for (const hole of holes) {
      const position = applyToPoint(converter.ctx.c2kMatPcb!, hole)
      const exportedHole = exportedHoles.find(
        (candidate) =>
          Math.abs(candidate.x - position.x) < 1e-6 &&
          Math.abs(candidate.y - position.y) < 1e-6,
      )
      expect(exportedHole).toBeDefined()
      expect(hole.hole_shape).toBe("circle")
      if (hole.hole_shape !== "circle")
        throw new Error("Expected circular mouse-bite holes")
      expect(hole.hole_diameter).toBeCloseTo(0.63)
      expect(exportedHole!.pad.shape).toBe("circle")
      expect(exportedHole!.pad.drill!.diameter).toBeCloseTo(
        hole.hole_diameter,
        6,
      )
    }
    const edgePoints = edgeCuts.flatMap((line) => [line.start!, line.end!])
    const panelTopLeft = applyToPoint(converter.ctx.c2kMatPcb!, {
      x: panel.center.x - panel.width / 2,
      y: panel.center.y + panel.height / 2,
    })
    expect(Math.min(...edgePoints.map((p) => p.x))).toBeCloseTo(panelTopLeft.x)
    expect(Math.max(...edgePoints.map((p) => p.x))).toBeCloseTo(
      panelTopLeft.x + panel.width,
    )
    expect(Math.min(...edgePoints.map((p) => p.y))).toBeCloseTo(panelTopLeft.y)
    expect(Math.max(...edgePoints.map((p) => p.y))).toBeCloseTo(
      panelTopLeft.y + panel.height,
    )
    for (const board of boards) {
      expect(
        isPointInsideEdgeCuts(
          edgeCuts,
          applyToPoint(converter.ctx.c2kMatPcb!, board.center),
        ),
      ).toBe(true)
    }
    for (const cutout of cutouts) {
      expect(cutout.shape).toBe("rect")
      if (cutout.shape !== "rect")
        throw new Error("Expected rectangular routing cutouts")
      expect(
        isPointInsideEdgeCuts(
          edgeCuts,
          applyToPoint(converter.ctx.c2kMatPcb!, cutout.center),
        ),
      ).toBe(false)
    }
    if (panelizationMethod === "tab-routing") {
      const slot = cutouts[0]!
      if (slot.shape !== "rect") throw new Error("Expected rectangular slot")
      expect(slot.corner_radius).toBeCloseTo(0.7)
      const toKicad = compose(
        converter.ctx.c2kMatPcb!,
        translate(slot.center.x, slot.center.y),
        rotate(((slot.rotation ?? 0) * Math.PI) / 180),
      )
      // The tab-facing end retains material outside its rounded cap.
      // Treating the slot as a square-ended rectangle removes these points.
      for (const side of [-1, 1]) {
        expect(
          isPointInsideEdgeCuts(
            edgeCuts,
            applyToPoint(toKicad, {
              x: slot.width / 2 - 0.07,
              y: side * (slot.height / 2 - 0.07),
            }),
          ),
        ).toBe(true)
      }
    }
    const drc = await getKicadPcbDrc(converter.getOutputString())
    expect(
      drc.violations.filter((v) => v.type === "invalid_outline"),
    ).toHaveLength(0)

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
      pcbDrillHoleColor: "#1ac4d2",
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
