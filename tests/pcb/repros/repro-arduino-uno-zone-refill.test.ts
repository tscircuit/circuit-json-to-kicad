import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { parseKicadPcb } from "kicadts"
import sharp from "sharp"
import { CircuitJsonToKicadPcbConverter } from "../../../lib/pcb/CircuitJsonToKicadPcbConverter"

type Point = { x: number; y: number }
type Zone = ReturnType<typeof parseKicadPcb>["zones"][number]

const zonePoints = (zone: Zone): Point[][] =>
  zone.polygons.map((polygon) =>
    (polygon.pts?.points ?? []).flatMap((point) =>
      "x" in point && "y" in point ? [{ x: point.x, y: point.y }] : [],
    ),
  )

function zoneState(zones: Zone[]) {
  const boundaryAreas = zones
    .map((zone) =>
      zonePoints(zone).reduce((sum, ring) => {
        const twiceArea = ring.reduce((area, point, index) => {
          const next = ring[(index + 1) % ring.length]!
          return area + point.x * next.y - next.x * point.y
        }, 0)
        return sum + Math.abs(twiceArea) / 2
      }, 0),
    )
    .map((area) => Math.round(area * 10_000) / 10_000)
    .sort((a, b) => a - b)

  return {
    boundaryAreas,
    clearances: [
      ...new Set(zones.map((zone) => zone.connectPads?.clearance)),
    ].sort((a, b) => (a ?? 0) - (b ?? 0)),
    count: zones.length,
  }
}

function zonePanel(zones: Zone[], x: number, title: string): string {
  const rings = zones.flatMap(zonePoints)
  const points = rings.flat()
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const scale = Math.min(440 / (maxX - minX), 380 / (maxY - minY))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const contours = rings
    .map((ring) => {
      const points = ring
        .map(
          (point) =>
            `${(point.x - centerX) * scale + x + 250},${(point.y - centerY) * scale + 310}`,
        )
        .join(" ")
      return `<polygon points="${points}" fill="#29b6f6" fill-opacity="0.09" stroke="#29b6f6" stroke-width="1.8"/>`
    })
    .join("\n")
  const clearances = [
    ...new Set(zones.map((zone) => zone.connectPads?.clearance)),
  ]
    .map((clearance) => `${clearance} mm`)
    .join(", ")

  return `<g>
    <rect x="${x}" y="0" width="500" height="560" fill="#111c2b"/>
    <text x="${x + 24}" y="38" font-size="22" fill="white">${title}</text>
    <text x="${x + 24}" y="67" font-size="17" fill="#9bdcff">${zones.length} zone boundaries</text>
    <text x="${x + 24}" y="91" font-size="17" fill="#9bdcff">Pad clearance: ${clearances}</text>
    ${contours}
  </g>`
}

test.failing("Arduino Uno zone refill settings and boundaries survive export", async () => {
  const filename = "arduino-uno-zones.kicad_pcb"
  const source = readFileSync(`tests/assets/${filename}`, "utf8")
  const originalZones = parseKicadPcb(source).zones

  const importer = new KicadToCircuitJsonConverter()
  importer.addFile(filename, source)
  importer.runUntilFinished()

  const exporter = new CircuitJsonToKicadPcbConverter(
    importer.getOutput() as any,
    { projectName: "arduino-uno-zones" },
  )
  exporter.runUntilFinished()
  const exportedZones = parseKicadPcb(exporter.getOutputString()).zones

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="560" viewBox="0 0 1000 560">
    <rect width="1000" height="560" fill="#111c2b"/>
    ${zonePanel(originalZones, 0, "Original Arduino Uno")}
    ${zonePanel(exportedZones, 500, "Current export")}
  </svg>`
  await expect(sharp(Buffer.from(svg)).png().toBuffer()).toMatchPngSnapshot(
    import.meta.path,
  )

  expect(originalZones).toHaveLength(5)
  expect(zoneState(exportedZones)).toEqual(zoneState(originalZones))
}, 30_000)
