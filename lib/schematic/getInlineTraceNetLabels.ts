import type { CircuitJson, Point, SchematicNetLabel } from "circuit-json"

/** Older core versions represent automatic net labels as trace-attached text.
 * Only promote text whose name is backed by the source connectivity graph.
 * Ordinary trace annotations must remain graphics.
 */
export function getInlineTraceNetLabels(circuitJson: CircuitJson) {
  const nets = circuitJson.filter((r) => r.type === "source_net")
  const sourceTraces = circuitJson.filter((r) => r.type === "source_trace")
  const traces = circuitJson.filter((r) => r.type === "schematic_trace")
  const labels: SchematicNetLabel[] = []
  const convertedTextIds = new Set<string>()
  for (const text of circuitJson) {
    if (text.type !== "schematic_text" || !text.source_trace_id) continue
    const source = sourceTraces.find(
      (t) => t.source_trace_id === text.source_trace_id,
    )
    if (!source) continue
    const net = nets.find(
      (n) =>
        n.name === text.text &&
        (source.connected_source_net_ids?.includes(n.source_net_id) ||
          (n.subcircuit_connectivity_map_key &&
            n.subcircuit_connectivity_map_key ===
              source.subcircuit_connectivity_map_key)),
    )
    if (!net) continue
    let nearest:
      | { point: Point; distance: number; horizontal: boolean }
      | undefined
    for (const trace of traces.filter(
      (t) => t.source_trace_id === source.source_trace_id,
    )) {
      for (const edge of trace.edges) {
        const dx = edge.to.x - edge.from.x,
          dy = edge.to.y - edge.from.y
        const length2 = dx * dx + dy * dy
        if (!length2) continue
        const fraction = Math.max(
          0,
          Math.min(
            1,
            ((text.position.x - edge.from.x) * dx +
              (text.position.y - edge.from.y) * dy) /
              length2,
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
        if (!nearest || distance < nearest.distance)
          nearest = {
            point,
            distance,
            horizontal: Math.abs(dx) >= Math.abs(dy),
          }
      }
    }
    // Prefer an open wire end so the label terminates the stub instead of
    // leaving a dangling segment beyond an otherwise connected inline label.
    const endpoints = new Map<
      string,
      { point: Point; count: number; horizontal: boolean }
    >()
    const ports = circuitJson.filter((r) => r.type === "schematic_port")
    for (const trace of traces.filter(
      (t) => t.source_trace_id === source.source_trace_id,
    )) {
      for (const edge of trace.edges) {
        for (const point of [edge.from, edge.to]) {
          const key = `${point.x.toFixed(6)},${point.y.toFixed(6)}`
          const previous = endpoints.get(key)
          endpoints.set(key, {
            point,
            count: (previous?.count ?? 0) + 1,
            horizontal:
              Math.abs(edge.to.x - edge.from.x) >=
              Math.abs(edge.to.y - edge.from.y),
          })
        }
      }
    }
    const freeEnds = [...endpoints.values()].filter(
      (end) =>
        end.count === 1 &&
        !ports.some(
          (p) =>
            Math.hypot(p.center.x - end.point.x, p.center.y - end.point.y) <
            1e-6,
        ),
    )
    if (freeEnds.length) {
      const end = freeEnds.sort(
        (a, b) =>
          Math.hypot(a.point.x - text.position.x, a.point.y - text.position.y) -
          Math.hypot(b.point.x - text.position.x, b.point.y - text.position.y),
      )[0]!
      nearest = { ...end, distance: 0 }
    }
    if (!nearest) continue
    labels.push({
      type: "schematic_net_label",
      schematic_net_label_id: `inline_${text.schematic_text_id}`,
      source_net_id: net.source_net_id,
      source_trace_id: source.source_trace_id,
      schematic_sheet_id: text.schematic_sheet_id,
      text: net.name,
      center: nearest.point,
      anchor_position: nearest.point,
      anchor_side: nearest.horizontal
        ? text.anchor === "right"
          ? "right"
          : "left"
        : "bottom",
    })
    convertedTextIds.add(text.schematic_text_id)
  }
  return { labels, convertedTextIds }
}
