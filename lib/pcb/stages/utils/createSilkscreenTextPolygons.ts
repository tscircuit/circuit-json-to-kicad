import fontData from "@tscircuit/alphabet/base64font"
import { parse } from "opentype.js"
import earcut from "earcut"
import type { PcbSilkscreenText } from "circuit-json"
import { applyToPoint, type Matrix } from "transformation-matrix"

interface Point {
  x: number
  y: number
}
const bytes = Buffer.from(fontData, "base64")
const font = parse(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
)

function contains(ring: Point[], point: Point) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside
  }
  return inside
}

/** Exact filled glyph geometry from the bundled font; no native font substitution. */
export function createSilkscreenTextPolygons(
  text: PcbSilkscreenText,
  transform: Matrix,
): Point[][] {
  const size = text.font_size ?? 1
  if (
    !text.text ||
    !text.anchor_position ||
    !Number.isFinite(size) ||
    size <= 0 ||
    !Number.isFinite(text.anchor_position.x) ||
    !Number.isFinite(text.anchor_position.y)
  )
    return []
  const alignment = text.anchor_alignment ?? "center"
  const contours: Point[][] = []
  const lineHeight = ((font.ascender - font.descender) / font.unitsPerEm) * size
  for (const [index, line] of text.text.split("\n").entries()) {
    const advance = font.getAdvanceWidth(line, size)
    const x = alignment.endsWith("left")
      ? 0
      : alignment.endsWith("right")
        ? -advance
        : -advance / 2
    let ring: Point[] = []
    for (const command of font.getPath(line, x, index * lineHeight, size)
      .commands) {
      if (command.type === "M") {
        ring = [{ x: command.x, y: command.y }]
        contours.push(ring)
      } else if (command.type === "L") ring.push({ x: command.x, y: command.y })
      else if (command.type !== "Z")
        throw new Error(
          "The bundled silkscreen font must use polygonal outlines",
        )
    }
  }
  const rings = contours.filter((ring) => ring.length >= 3)
  if (!rings.length) return []
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const ring of rings) {
    for (const point of ring) {
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y)
      maxY = Math.max(maxY, point.y)
    }
  }
  const anchorX = alignment.endsWith("left")
    ? minX
    : alignment.endsWith("right")
      ? maxX
      : (minX + maxX) / 2
  const anchorY = alignment.startsWith("top")
    ? minY
    : alignment.startsWith("bottom")
      ? maxY
      : (minY + maxY) / 2
  const angle = ((text.ccw_rotation ?? 0) * Math.PI) / 180
  const mirror = text.is_mirrored ?? text.layer === "bottom"
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const mapPoint = (point: Point) => {
    const x = (point.x - anchorX) * (mirror ? -1 : 1)
    const y = -(point.y - anchorY)
    return applyToPoint(transform, {
      x: text.anchor_position.x + x * cos - y * sin,
      y: text.anchor_position.y + x * sin + y * cos,
    })
  }
  // Triangulate outer contours together with their holes, preserving counters
  // in letters such as A, B and O. KiCad filled polygons cannot encode holes.
  const containers = rings.map((ring, i) =>
    rings.flatMap((other, j) =>
      i !== j && contains(other, ring[0]!) ? [j] : [],
    ),
  )
  const polygons: Point[][] = []
  rings.forEach((outer, i) => {
    if (containers[i]!.length % 2) return
    const holes = rings.filter(
      (_, j) =>
        containers[j]!.length === containers[i]!.length + 1 &&
        containers[j]!.includes(i),
    )
    const vertices = [...outer]
    const holeIndices: number[] = []
    for (const hole of holes) {
      holeIndices.push(vertices.length)
      vertices.push(...hole)
    }
    const indices = earcut(
      vertices.flatMap((p) => [p.x, p.y]),
      holeIndices,
    )
    for (let k = 0; k < indices.length; k += 3)
      polygons.push(indices.slice(k, k + 3).map((j) => mapPoint(vertices[j]!)))
  })
  return polygons
}
