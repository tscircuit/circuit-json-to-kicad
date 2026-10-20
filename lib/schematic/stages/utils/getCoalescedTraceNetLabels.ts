import type { CircuitJson } from "circuit-json"

type CircuitElement = CircuitJson[number]
type SchematicTrace = Extract<CircuitElement, { type: "schematic_trace" }>
type SourceTrace = Extract<CircuitElement, { type: "source_trace" }>
type SourceNet = Extract<CircuitElement, { type: "source_net" }>
type SchematicNetLabel = Extract<
  CircuitElement,
  { type: "schematic_net_label" }
>
type SchematicPort = Extract<CircuitElement, { type: "schematic_port" }>

export interface CoalescedTraceNetLabel {
  schematic_trace_id: string
  value: string
  anchor_position: { x: number; y: number }
  rotation: 0 | 90
}

const COALESCED_SOURCE_TRACE_PREFIX = "schematic_port_"
const POINT_TOLERANCE = 1e-6

/**
 * Returns local labels for synthetic, coalesced schematic wires that need a
 * name to reconnect their otherwise separate KiCad wire islands.
 * The converter supplies schematic elements for one sheet, while source
 * metadata may include the entire design.
 */
export function getCoalescedTraceNetLabels(
  circuitJson: CircuitJson,
): CoalescedTraceNetLabel[] {
  const elements = circuitJson as CircuitElement[]
  const schematicTraces = elements.filter(
    (element): element is SchematicTrace => element.type === "schematic_trace",
  )
  const sourceTraces = elements.filter(
    (element): element is SourceTrace => element.type === "source_trace",
  )
  const sourceNets = elements.filter(
    (element): element is SourceNet => element.type === "source_net",
  )
  const explicitLabels = elements.filter(
    (element): element is SchematicNetLabel =>
      element.type === "schematic_net_label",
  )
  const schematicPorts = elements.filter(
    (element): element is SchematicPort => element.type === "schematic_port",
  )
  const sourceTraceIds = new Set(
    sourceTraces.map((trace) => trace.source_trace_id),
  )
  const activeKeys = new Set(
    schematicTraces
      .map((trace) => trace.subcircuit_connectivity_map_key)
      .filter((key): key is string => !!key?.trim()),
  )
  const explicitlyLabeledNetIds = new Set(
    explicitLabels.map((label) => label.source_net_id),
  )
  const activeSourcePortIds = new Set(
    schematicPorts.map((port) => port.source_port_id),
  )
  const portConnectedNetIds = new Set(
    sourceTraces
      .filter((trace) =>
        trace.connected_source_port_ids.some((portId) =>
          activeSourcePortIds.has(portId),
        ),
      )
      .flatMap((trace) => trace.connected_source_net_ids),
  )
  const activeNetIds = new Set(
    sourceNets
      .filter(
        (net) =>
          (net.subcircuit_connectivity_map_key != null &&
            activeKeys.has(net.subcircuit_connectivity_map_key)) ||
          explicitlyLabeledNetIds.has(net.source_net_id) ||
          portConnectedNetIds.has(net.source_net_id),
      )
      .map((net) => net.source_net_id),
  )

  const inferred: CoalescedTraceNetLabel[] = []
  for (const trace of schematicTraces) {
    const syntheticTraceId = trace.source_trace_id
    const key = trace.subcircuit_connectivity_map_key
    if (
      !syntheticTraceId?.startsWith(COALESCED_SOURCE_TRACE_PREFIX) ||
      sourceTraceIds.has(syntheticTraceId) ||
      !key?.trim() ||
      trace.edges.length === 0
    ) {
      continue
    }

    const usableEdges = trace.edges.filter(
      (edge) =>
        isFinitePoint(edge.from) &&
        isFinitePoint(edge.to) &&
        (edge.from.x !== edge.to.x || edge.from.y !== edge.to.y),
    )
    if (usableEdges.length === 0) continue

    const matchingNets = sourceNets.filter(
      (net) =>
        net.subcircuit_connectivity_map_key === key &&
        (trace.subcircuit_id == null ||
          net.subcircuit_id === trace.subcircuit_id),
    )
    const candidateNames = new Set(
      matchingNets.map((net) => net.name).filter((name) => !!name?.trim()),
    )
    const candidateIds = new Set(matchingNets.map((net) => net.source_net_id))
    if (candidateNames.size !== 1 || candidateIds.size !== 1) continue

    const [value] = candidateNames
    if (!value) continue
    const matchedNet = matchingNets[0]!
    // A name shared by different identities or keys cannot safely identify a
    // local label on this sheet: KiCad would short those identities by name.
    const conflictingSameName = sourceNets.some(
      (net) =>
        activeNetIds.has(net.source_net_id) &&
        net.name === value &&
        (net.source_net_id !== matchedNet.source_net_id ||
          net.subcircuit_connectivity_map_key !== key),
    )
    if (conflictingSameName) continue

    const conflictingExplicitText = explicitLabels.some(
      (label) =>
        (label.text === value &&
          label.source_net_id !== matchedNet.source_net_id) ||
        (label.source_net_id === matchedNet.source_net_id &&
          label.text !== value),
    )
    if (conflictingExplicitText) continue

    const hasExistingLabelOnTrace = explicitLabels.some((label) => {
      const point = label.anchor_position ?? label.center
      return (
        point != null &&
        isFinitePoint(point) &&
        usableEdges.some((edge) => pointOnSegment(point, edge.from, edge.to))
      )
    })
    if (hasExistingLabelOnTrace) continue

    const anchor = chooseLabelAnchor(usableEdges[0]!)
    inferred.push({
      schematic_trace_id: trace.schematic_trace_id,
      value,
      // Existing wire vertex so KiCad's local label is electrically attached.
      anchor_position: anchor.position,
      rotation: anchor.rotation,
    })
  }

  const anchorsByPosition = new Map<string, CoalescedTraceNetLabel[]>()
  for (const label of inferred) {
    const key = `${label.anchor_position.x},${label.anchor_position.y}`
    const atPosition = anchorsByPosition.get(key) ?? []
    atPosition.push(label)
    anchorsByPosition.set(key, atPosition)
  }
  return [...anchorsByPosition.values()]
    .filter((labels) => new Set(labels.map((label) => label.value)).size === 1)
    .map((labels) => labels[0]!)
}

function isFinitePoint(point: { x: number; y: number }): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

function chooseLabelAnchor(edge: SchematicTrace["edges"][number]): {
  position: { x: number; y: number }
  rotation: 0 | 90
} {
  if (edge.from.y === edge.to.y) {
    const left = edge.from.x <= edge.to.x ? edge.from : edge.to
    return { position: { ...left }, rotation: 0 }
  }

  // Circuit JSON's positive Y points up; the KiCad transform flips that axis.
  const bottom = edge.from.y <= edge.to.y ? edge.from : edge.to
  return { position: { ...bottom }, rotation: 90 }
}

function pointOnSegment(
  point: { x: number; y: number },
  from: { x: number; y: number },
  to: { x: number; y: number },
): boolean {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return false
  const t = ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared
  if (t < -POINT_TOLERANCE || t > 1 + POINT_TOLERANCE) return false
  const projectedX = from.x + t * dx
  const projectedY = from.y + t * dy
  return (
    Math.hypot(point.x - projectedX, point.y - projectedY) <= POINT_TOLERANCE
  )
}
