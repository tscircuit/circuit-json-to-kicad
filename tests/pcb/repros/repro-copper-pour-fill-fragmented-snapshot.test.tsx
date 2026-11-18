import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { Circuit } from "tscircuit"
import { getKicadPcbDrc } from "../../fixtures/get-kicad-pcb-drc"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { stackPngsVertically } from "../../fixtures/stackPngsVertically"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { GndPourWithPadHolesBoard } from "./assets/gnd-pour-with-pad-holes-board"

const PALETTE = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#a855f7"]

const getFilledPolygons = (kicadPcb: string) =>
  [...kicadPcb.matchAll(/\(filled_polygon[\s\S]*?\(pts([\s\S]*?)\)\s*\)/g)].map(
    (match) =>
      [...match[1]!.matchAll(/\(xy\s+([-\d.e]+)\s+([-\d.e]+)/g)].map(
        ([, x, y]) => ({ x: Number(x), y: Number(y) }),
      ),
  )

// Draws every exported (filled_polygon ...) with its own outline so the
// fragmentation of the zone fill is visible.
const renderFilledPolygons = async (
  polygons: { x: number; y: number }[][],
  width: number,
) => {
  const points = polygons.flat()
  const minX = Math.min(...points.map((p) => p.x))
  const minY = Math.min(...points.map((p) => p.y))
  const maxX = Math.max(...points.map((p) => p.x))
  const maxY = Math.max(...points.map((p) => p.y))
  const scale = (width - 40) / (maxX - minX)
  const height = Math.round((maxY - minY) * scale + 40)
  const paths = polygons
    .map(
      (polygon, i) =>
        `<polygon points="${polygon
          .map(
            (p) =>
              `${(20 + (p.x - minX) * scale).toFixed(2)},${(20 + (p.y - minY) * scale).toFixed(2)}`,
          )
          .join(
            " ",
          )}" fill="${PALETTE[i % PALETTE.length]}" fill-opacity="0.55" stroke="#111827" stroke-width="1.5"/>`,
    )
    .join("\n")
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ffffff"/>${paths}</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

const renderTextPanel = async (lines: string[], width: number) => {
  const height = lines.length * 22 + 24
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ffffff"/>${lines
    .map(
      (line, i) =>
        `<text x="12" y="${28 + i * 22}" font-family="monospace" font-size="15" fill="${line.startsWith("KiCad DRC") ? "#b91c1c" : "#111827"}">${line}</text>`,
    )
    .join("")}</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

test("copper pour fill KiCad export snapshot", async () => {
  const circuit = new Circuit()
  circuit.add(<GndPourWithPadHolesBoard />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const pour = circuitJson.find((element) => element.type === "pcb_copper_pour")
  const holeCount =
    pour?.shape === "brep" ? (pour.brep_shape.inner_rings?.length ?? 0) : 0

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const filledPolygons = getFilledPolygons(output)
  const drc = await getKicadPcbDrc(output)
  const isolatedCopper = drc.violations.filter(
    (violation) => violation.type === "isolated_copper",
  ).length

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    pcbLayers: ["F.Cu", "Edge.Cuts"],
  })
  const boards = await stackCircuitJsonKicadPngs(
    await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
    kicadSnapshot.generatedFileContent["temp_file.png"]!,
  )
  const { width = 800 } = await sharp(boards).metadata()

  await expect(
    stackPngsVertically([
      boards,
      await renderTextPanel(
        [
          `Circuit JSON: 1 pcb_copper_pour (GND), 1 outline + ${holeCount} holes`,
          `KiCad zone fill: ${filledPolygons.length} separate filled_polygon pieces (drawn below)`,
          `KiCad DRC isolated_copper warnings: ${isolatedCopper}`,
        ],
        width,
      ),
      await renderFilledPolygons(filledPolygons, width),
    ]),
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
