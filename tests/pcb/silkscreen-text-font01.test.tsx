import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { identity } from "transformation-matrix"
import { createSilkscreenTextPolygons } from "lib/pcb/stages/utils/createSilkscreenTextPolygons"
import fontData from "@tscircuit/alphabet/base64font"
import { parse } from "opentype.js"

const bytes = Buffer.from(fontData, "base64")
const font = parse(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
)
const bounds = (polys: { x: number; y: number }[][]) => {
  const points = polys.flat()
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  }
}

test("silkscreen outlines preserve bundled font proportions at every anchor", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={10.4} height={10.4}>
      <silkscreentext text="W" fontSize={0.8} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const source = circuit
    .getCircuitJson()
    .find((e) => e.type === "pcb_silkscreen_text")!
  if (source.type !== "pcb_silkscreen_text") throw Error("Missing text")
  for (const text of [
    "W",
    "SW",
    "R1",
    "SN74LVC1G17DCKR",
    "ABO",
    "III",
    "${REFERENCE}",
  ]) {
    for (const size of [0.4, 0.8, 1.5]) {
      const reference = font.getPath(text, 0, 0, size).getBoundingBox()
      const polygons = createSilkscreenTextPolygons(
        { ...source, text, font_size: size },
        identity(),
      )
      const actual = bounds(polygons)
      expect(actual.maxX - actual.minX).toBeCloseTo(
        reference.x2 - reference.x1,
        8,
      )
      expect(actual.maxY - actual.minY).toBeCloseTo(
        reference.y2 - reference.y1,
        8,
      )
      const rotated = bounds(
        createSilkscreenTextPolygons(
          { ...source, text, font_size: size, ccw_rotation: 90 },
          identity(),
        ),
      )
      expect(rotated.maxY - rotated.minY).toBeCloseTo(
        actual.maxX - actual.minX,
        8,
      )
      const mirrored = createSilkscreenTextPolygons(
        { ...source, text, font_size: size, layer: "bottom" },
        identity(),
      )
      polygons.forEach((poly, i) =>
        poly.forEach((p, j) => {
          expect(mirrored[i]![j]!.x).toBeCloseTo(-p.x, 8)
          expect(mirrored[i]![j]!.y).toBeCloseTo(p.y, 8)
        }),
      )
    }
  }
  for (const anchor of [
    "top_left",
    "top_center",
    "top_right",
    "center_left",
    "center",
    "center_right",
    "bottom_left",
    "bottom_center",
    "bottom_right",
  ] as const) {
    const result = bounds(
      createSilkscreenTextPolygons(
        { ...source, text: "W\nR1", anchor_alignment: anchor },
        identity(),
      ),
    )
    expect(
      anchor.endsWith("left")
        ? result.minX
        : anchor.endsWith("right")
          ? result.maxX
          : (result.minX + result.maxX) / 2,
    ).toBeCloseTo(0, 8)
    expect(
      anchor.startsWith("top")
        ? result.maxY
        : anchor.startsWith("bottom")
          ? result.minY
          : (result.minY + result.maxY) / 2,
    ).toBeCloseTo(0, 8)
  }
  expect(
    createSilkscreenTextPolygons({ ...source, text: " \n " }, identity()),
  ).toEqual([])
})
