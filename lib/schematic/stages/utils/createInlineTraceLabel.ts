import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"
import type {
  Point,
  SchematicPort,
  SchematicText,
  SchematicTrace,
} from "circuit-json"
import { Label, TextEffectsJustify } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import { createTextEffects } from "../symbols-stage-converters/createTextEffects"

interface LabelPlacement {
  point: Point
  angle: 0 | 90 | 180 | 270
  justify: "left" | "right"
}

function getEndpointPlacement(point: Point, toward: Point): LabelPlacement {
  // Text extends from the open endpoint back along its adjoining wire.
  if (Math.abs(toward.x - point.x) >= Math.abs(toward.y - point.y)) {
    return toward.x > point.x
      ? { point, angle: 0, justify: "left" }
      : { point, angle: 180, justify: "right" }
  }
  return toward.y > point.y
    ? { point, angle: 90, justify: "left" }
    : { point, angle: 270, justify: "right" }
}

function findLabelPlacement(
  text: SchematicText,
  edges: SchematicTrace["edges"],
  ports: SchematicPort[],
): LabelPlacement | undefined {
  let nearest: (LabelPlacement & { distance: number }) | undefined
  const endpoints = new Map<
    string,
    { point: Point; toward: Point; count: number }
  >()

  for (const edge of edges) {
    const dx = edge.to.x - edge.from.x
    const dy = edge.to.y - edge.from.y
    const lengthSquared = dx * dx + dy * dy
    if (lengthSquared === 0) continue

    // Text is drawn beside the wire; its electrical anchor must lie on it.
    const fraction = Math.max(
      0,
      Math.min(
        1,
        ((text.position.x - edge.from.x) * dx +
          (text.position.y - edge.from.y) * dy) /
          lengthSquared,
      ),
    )
    const point = {
      x: edge.from.x + fraction * dx,
      y: edge.from.y + fraction * dy,
    }
    const distance = Math.hypot(
      text.position.x - point.x,
      text.position.y - point.y,
    )
    if (!nearest || distance < nearest.distance) {
      const horizontal = Math.abs(dx) >= Math.abs(dy)
      nearest = {
        point,
        distance,
        angle: horizontal ? (text.anchor === "right" ? 180 : 0) : 90,
        justify: horizontal && text.anchor === "right" ? "right" : "left",
      }
    }

    for (const [point, toward] of [
      [edge.from, edge.to],
      [edge.to, edge.from],
    ] as const) {
      // Ignore floating-point rounding differences at shared endpoints.
      const key = `${point.x.toFixed(6)},${point.y.toFixed(6)}`
      endpoints.set(key, {
        point,
        toward,
        count: (endpoints.get(key)?.count ?? 0) + 1,
      })
    }
  }

  // Prefer an open end to avoid leaving a dangling wire beyond the label.
  let closestEnd: (LabelPlacement & { distance: number }) | undefined
  for (const end of endpoints.values()) {
    if (
      end.count !== 1 ||
      ports.some(
        (port) =>
          Math.hypot(port.center.x - end.point.x, port.center.y - end.point.y) <
          1e-6,
      )
    )
      continue
    const distance = Math.hypot(
      end.point.x - text.position.x,
      end.point.y - text.position.y,
    )
    if (!closestEnd || distance < closestEnd.distance) {
      closestEnd = { ...getEndpointPlacement(end.point, end.toward), distance }
    }
  }
  return closestEnd ?? nearest
}

/** Convert source-backed trace text directly to a KiCad local label. */
export function createInlineTraceLabel({
  text,
  db,
  transform,
  fontSize,
}: {
  text: SchematicText
  db: CircuitJsonUtilObjects
  transform: Matrix
  fontSize: number
}): Label | undefined {
  if (!text.source_trace_id) return undefined
  const sourceTrace = db.source_trace.get(text.source_trace_id)
  if (!sourceTrace) return undefined
  const matchesSourceNet = db.source_net
    .list()
    .some(
      (net) =>
        net.name === text.text &&
        (sourceTrace.connected_source_net_ids?.includes(net.source_net_id) ||
          (net.subcircuit_connectivity_map_key &&
            net.subcircuit_connectivity_map_key ===
              sourceTrace.subcircuit_connectivity_map_key)),
    )
  if (!matchesSourceNet) return undefined

  const edges = db.schematic_trace
    .list()
    .filter((trace) => trace.source_trace_id === sourceTrace.source_trace_id)
    .flatMap((trace) => trace.edges)
  const placement = findLabelPlacement(text, edges, db.schematic_port.list())
  if (!placement) return undefined

  const { x, y } = applyToPoint(transform, placement.point)
  const effects = createTextEffects(fontSize, false)
  effects.justify = new TextEffectsJustify({
    horizontal: placement.justify,
    vertical: "bottom",
  })
  return new Label({
    value: text.text,
    at: [x, y, placement.angle],
    effects,
    uuid: crypto.randomUUID(),
  })
}
