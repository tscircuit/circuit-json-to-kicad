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
import { getTextJustificationFromAnchor } from "./getTextJustificationFromAnchor"

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

function getOpenEndPlacement(
  position: Point,
  edges: SchematicTrace["edges"],
  connectedPorts: SchematicPort[],
): LabelPlacement | undefined {
  const endpoints = new Map<
    string,
    {
      point: Point
      toward: Point
      count: number
      schematicPortId?: string
    }
  >()

  for (const edge of edges) {
    if (edge.from.x === edge.to.x && edge.from.y === edge.to.y) continue

    for (const [point, toward, schematicPortId] of [
      [edge.from, edge.to, edge.from_schematic_port_id],
      [edge.to, edge.from, edge.to_schematic_port_id],
    ] as const) {
      // Ignore floating-point rounding differences at shared endpoints.
      const key = `${point.x.toFixed(6)},${point.y.toFixed(6)}`
      endpoints.set(key, {
        point,
        toward,
        schematicPortId,
        count: (endpoints.get(key)?.count ?? 0) + 1,
      })
    }
  }

  const freeEnds = [...endpoints.values()].filter(
    (end) =>
      end.count === 1 &&
      !connectedPorts.some(
        (port) =>
          port.schematic_port_id === end.schematicPortId ||
          Math.hypot(port.center.x - end.point.x, port.center.y - end.point.y) <
            1e-6,
      ),
  )
  // A single free end is determined by connectivity, not the text position.
  if (freeEnds.length === 1) {
    const end = freeEnds[0]!
    return getEndpointPlacement(end.point, end.toward)
  }

  let closestEnd: (LabelPlacement & { distance: number }) | undefined
  for (const end of freeEnds) {
    const distance = Math.hypot(
      end.point.x - position.x,
      end.point.y - position.y,
    )
    if (!closestEnd || distance < closestEnd.distance) {
      closestEnd = { ...getEndpointPlacement(end.point, end.toward), distance }
    }
  }
  return closestEnd
}

function findNearestTracePoint(position: Point, traces: SchematicTrace[]) {
  let nearest:
    | {
        point: Point
        distance: number
        trace: SchematicTrace
        edge: SchematicTrace["edges"][number]
      }
    | undefined

  for (const trace of traces) {
    for (const edge of trace.edges) {
      const dx = edge.to.x - edge.from.x
      const dy = edge.to.y - edge.from.y
      const lengthSquared = dx * dx + dy * dy
      if (lengthSquared === 0) continue

      const fraction = Math.max(
        0,
        Math.min(
          1,
          ((position.x - edge.from.x) * dx + (position.y - edge.from.y) * dy) /
            lengthSquared,
        ),
      )
      const point = {
        x: edge.from.x + fraction * dx,
        y: edge.from.y + fraction * dy,
      }
      const distance = Math.hypot(position.x - point.x, position.y - point.y)
      if (!nearest || distance < nearest.distance) {
        nearest = { point, distance, trace, edge }
      }
    }
  }
  return nearest
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

  const connectedPorts = sourceTrace.connected_source_port_ids.flatMap(
    (sourcePortId) => db.schematic_port.list({ source_port_id: sourcePortId }),
  )
  const traces = db.schematic_trace.list({
    source_trace_id: sourceTrace.source_trace_id,
  })
  let trace = traces[0]
  let nearest: ReturnType<typeof findNearestTracePoint>
  if (traces.length > 1) {
    // One source trace can produce several disconnected wire stubs. Select by
    // distance to the wire so each label stays on the stub it names.
    nearest = findNearestTracePoint(text.position, traces)
    trace = nearest?.trace
  }
  if (!trace) return undefined

  let placement = getOpenEndPlacement(
    text.position,
    trace.edges,
    connectedPorts,
  )
  if (!placement) {
    // A wire between pins or a closed path has no free end. Attach to the
    // nearest point on that wire, preserving the source text alignment.
    nearest ??= findNearestTracePoint(text.position, [trace])
    if (!nearest) return undefined
    const { edge, point } = nearest
    const horizontal =
      Math.abs(edge.to.x - edge.from.x) >= Math.abs(edge.to.y - edge.from.y)
    const justify =
      getTextJustificationFromAnchor(text.anchor)?.horizontal ?? "left"
    placement = {
      point,
      angle: horizontal
        ? justify === "right"
          ? 180
          : 0
        : justify === "right"
          ? 270
          : 90,
      justify,
    }
  }

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
