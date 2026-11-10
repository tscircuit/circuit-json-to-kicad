import type { Point, SchematicComponent } from "circuit-json"
import type { SchematicSymbol, SymbolPin } from "kicadts"
import {
  SymbolRectangleStart,
  SymbolRectangleEnd,
  SymbolCircleCenter,
  SymbolCircleRadius,
} from "kicadts"
import type { ConverterContext } from "../../../types"
import {
  toSchematicInternalUnits,
  transformSchematicPoint,
  type SchematicConnectionGrid,
} from "./schematicCoordinates"

// KiCad's default connection grid is 50 mil. Work in its integer schematic
// units so equality, ordering, and grid membership do not need tolerances.
const GRID = 12_700
const units = (point: Point): Point => ({
  x: toSchematicInternalUnits(point.x),
  y: toSchematicInternalUnits(point.y),
})
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y

type AxisPoint = { lower: number; upper: number }
type Attachment =
  | { type: "lead"; endpoint: Point; inner: Point }
  | { type: "edge"; from: Point; to: Point }
  | { type: "circle"; center: Point; radius: number }

function findAttachment(
  symbol: SchematicSymbol,
  point: Point,
  direction: Point,
): Attachment | undefined {
  const leads: Extract<Attachment, { type: "lead" }>[] = []
  const onSegment = (from: Point, to: Point) => {
    const cross =
      BigInt(point.x - from.x) * BigInt(to.y - from.y) -
      BigInt(point.y - from.y) * BigInt(to.x - from.x)
    return (
      cross === 0n &&
      point.x >= Math.min(from.x, to.x) &&
      point.x <= Math.max(from.x, to.x) &&
      point.y >= Math.min(from.y, to.y) &&
      point.y <= Math.max(from.y, to.y)
    )
  }
  const edge = (from: Point, to: Point): Attachment | undefined => {
    if (!onSegment(from, to)) return undefined
    // The pin must enter the edge rather than run along it.
    if (direction.x !== 0 ? from.y === to.y : from.x === to.x) return undefined
    return { type: "edge", from, to }
  }
  for (const unit of symbol.subSymbols) {
    for (const polyline of unit.polylines) {
      const vertices = polyline.points?.points ?? []
      const points = vertices.filter(
        (vertex): vertex is typeof vertex & Point =>
          "x" in vertex && "y" in vertex,
      )
      if (points.length !== vertices.length || points.length < 2) continue
      const first = units(points[0]!)
      const last = units(points.at(-1)!)
      const filled = polyline.fill?.type && polyline.fill.type !== "none"
      if (!samePoint(first, last) && !filled) {
        if (samePoint(first, point))
          leads.push({
            type: "lead",
            endpoint: points[0]!,
            inner: units(points[1]!),
          })
        if (samePoint(last, point))
          leads.push({
            type: "lead",
            endpoint: points.at(-1)!,
            inner: units(points.at(-2)!),
          })
      }
      for (let index = 1; index < points.length; index++) {
        const found = edge(units(points[index - 1]!), units(points[index]!))
        if (found) return found
      }
      if (filled) {
        const found = edge(last, first)
        if (found) return found
      }
    }
    for (const rectangle of unit.rectangles) {
      const start = rectangle
        .getChildren()
        .find((child) => child instanceof SymbolRectangleStart)
      const end = rectangle
        .getChildren()
        .find((child) => child instanceof SymbolRectangleEnd)
      if (!start || !end) continue
      const from = units(start)
      const to = units(end)
      const corners = [
        from,
        { x: to.x, y: from.y },
        to,
        { x: from.x, y: to.y },
        from,
      ]
      for (let index = 1; index < corners.length; index++) {
        const found = edge(corners[index - 1]!, corners[index]!)
        if (found) return found
      }
    }
    for (const circle of unit.circles) {
      const centerPoint = circle
        .getChildren()
        .find((child) => child instanceof SymbolCircleCenter)
      const radiusValue = circle
        .getChildren()
        .find((child) => child instanceof SymbolCircleRadius)
      if (!centerPoint || !radiusValue) continue
      const center = units(centerPoint)
      const radius = toSchematicInternalUnits(radiusValue.value)
      // Compare the radial distance at KiCad's native coordinate resolution.
      if (
        Math.round(Math.hypot(point.x - center.x, point.y - center.y)) ===
        radius
      ) {
        return { type: "circle", center, radius }
      }
    }
  }
  // Only a free end of one stroke can be adjusted as a stem. A shared vertex
  // may be part of the body, so retain it unless an unchanged edge was found.
  if (leads.length > 1)
    throw new GridPlacementError(
      "A pin meets multiple drawing strokes; its stem cannot move without changing the symbol body.",
    )
  return leads[0]
}

/** Embed the electrical coordinates on the grid without merging coordinates.
 * For orthogonal wires, preserving X/Y equality and strict ordering preserves
 * intersections and point-on-segment relationships, including T junctions.
 */
function placeAxis(points: Map<number, AxisPoint>): Map<number, number> {
  const sorted = [...points].sort(([a], [b]) => a - b)
  let upper = Number.POSITIVE_INFINITY
  for (let index = sorted.length - 1; index >= 0; index--) {
    const constraint = sorted[index]![1]
    upper = Math.min(upper - 1, Math.floor(constraint.upper / GRID))
    constraint.upper = upper
  }
  const placed = new Map<number, number>()
  let previous = Number.NEGATIVE_INFINITY
  for (const [value, constraint] of sorted) {
    const lower = Math.max(previous + 1, Math.ceil(constraint.lower / GRID))
    if (lower > constraint.upper) {
      throw new GridPlacementError(
        "Cannot fit schematic connections on KiCad's 1.27 mm grid without changing symbol bodies. Increase pin spacing or adjust the schematic layout.",
      )
    }
    const position = Math.max(
      lower,
      Math.min(Math.round(value / GRID), constraint.upper),
    )
    placed.set(value, position * GRID)
    previous = position
  }
  return placed
}

class GridPlacementError extends Error {}

type PinPlacement = {
  pin: SymbolPin
  origin: Point
  position: Point
  direction: Point
  componentId: string
  attachment?: Attachment
  local: Point
}

/** Place shared symbols and orthogonal wiring together. Fixed local pin offsets
 * tie each connection to its instance origin. Strict coordinate ordering keeps
 * separate wires separate. A positive constraint cycle means the existing
 * layout cannot fit with these local pin offsets without rerouting.
 */
function placeSheetAxis(
  coordinates: Set<number>,
  pins: PinPlacement[],
  axis: "x" | "y",
  labelSpans: [number, number][],
) {
  const sorted = [...coordinates].sort((a, b) => a - b)
  if (sorted.length === 0) {
    return {
      coordinates: new Map<number, number>(),
      origins: new Map<string, number>(),
    }
  }
  const indices = new Map(sorted.map((value, index) => [value, index]))
  const positions = sorted.map((value) => Math.round(value / GRID))
  const origins = new Map<string, number>()
  const constraints: { from: number; to: number; distance: number }[] = []
  for (let index = 1; index < sorted.length; index++) {
    constraints.push({ from: index - 1, to: index, distance: 1 })
  }
  for (const [from, to] of labelSpans) {
    constraints.push({
      from: indices.get(from)!,
      to: indices.get(to)!,
      distance: Math.ceil((to - from) / GRID),
    })
  }
  for (const pin of pins) {
    let originIndex = origins.get(pin.componentId)
    if (originIndex === undefined) {
      originIndex = positions.length
      origins.set(pin.componentId, originIndex)
      positions.push(Math.round(pin.origin[axis] / GRID))
    }
    const pointIndex = indices.get(pin.position[axis])!
    const offset = (pin.local[axis] / GRID) * (axis === "y" ? -1 : 1)
    constraints.push({ from: originIndex, to: pointIndex, distance: offset })
    constraints.push({ from: pointIndex, to: originIndex, distance: -offset })
  }
  for (let iteration = 0; iteration < positions.length; iteration++) {
    let changed = false
    for (const { from, to, distance } of constraints) {
      const required = positions[from]! + distance
      if (positions[to]! < required) {
        positions[to] = required
        changed = true
      }
    }
    if (!changed)
      return {
        coordinates: new Map(
          sorted.map((value, index) => [value, positions[index]! * GRID]),
        ),
        origins: new Map(
          [...origins].map(([id, index]) => [id, positions[index]! * GRID]),
        ),
      }
  }
  throw new GridPlacementError(
    "Grid placement requires a different shared pin layout or rerouted wires. Adjust the placement or routing.",
  )
}

export function alignSchematicConnectionsToGrid(
  ctx: ConverterContext,
  components: { component: SchematicComponent; symbol: SchematicSymbol }[],
): { grid: SchematicConnectionGrid; origins: Map<string, Point> } | undefined {
  // Connection-grid requirements apply to every sheet, independently of where
  // its symbol artwork came from.
  try {
    return planGridPlacement(ctx, components)
  } catch (error) {
    if (!(error instanceof GridPlacementError)) throw error
    // Retain the authored schematic when adapting it would require a redesign.
    // Do not emit a partially moved circuit or suppress KiCad's ERC warning.
    console.warn(
      `KiCad connection grid: ${error.message} Exporting the original coordinates.`,
    )
    return undefined
  }
}

function planGridPlacement(
  ctx: ConverterContext,
  components: { component: SchematicComponent; symbol: SchematicSymbol }[],
): { grid: SchematicConnectionGrid; origins: Map<string, Point> } {
  const sourcePoint = (point: Point) =>
    units(transformSchematicPoint(ctx.c2kMatSch!, point))
  const coordinates = { x: new Set<number>(), y: new Set<number>() }
  const labelSpans: Record<"x" | "y", [number, number][]> = { x: [], y: [] }
  const add = (point: Point) => {
    coordinates.x.add(point.x)
    coordinates.y.add(point.y)
  }
  const pinPlacements: PinPlacement[] = []
  for (const { component, symbol } of components) {
    const origin = sourcePoint(component.center)
    const axes = {
      x: new Map<number, AxisPoint>(),
      y: new Map<number, AxisPoint>(),
    }
    const symbolPins: PinPlacement[] = []
    for (const unit of symbol.subSymbols) {
      for (const pin of unit.pins) {
        if (!pin.at) continue
        const local = units(pin.at)
        for (const axis of ["x", "y"] as const) {
          if (!axes[axis].has(local[axis]))
            axes[axis].set(local[axis], {
              lower: Number.NEGATIVE_INFINITY,
              upper: Number.POSITIVE_INFINITY,
            })
        }
        const angle = (((pin.at.angle ?? 0) % 360) + 360) % 360
        const direction = (
          {
            0: { x: -1, y: 0 },
            90: { x: 0, y: -1 },
            180: { x: 1, y: 0 },
            270: { x: 0, y: 1 },
          } as Record<number, Point>
        )[angle]
        if (!direction)
          throw new GridPlacementError(
            "Grid placement requires orthogonal schematic pins.",
          )
        const position = { x: origin.x + local.x, y: origin.y - local.y }
        add(position)
        const body = {
          x: local.x - direction.x * toSchematicInternalUnits(pin.length ?? 0),
          y: local.y - direction.y * toSchematicInternalUnits(pin.length ?? 0),
        }
        const tipAttachment = findAttachment(symbol, local, direction)
        const attachment =
          tipAttachment ?? findAttachment(symbol, body, direction)
        if (!attachment && symbol.subSymbols.some((unit) => unit.arcs.length)) {
          throw new GridPlacementError(
            "Cannot determine a pin's attachment to curved symbol artwork. Adjust the pin or provide a straight stem before grid placement.",
          )
        }
        symbolPins.push({
          pin,
          origin,
          position,
          direction,
          attachment,
          local,
          componentId: component.schematic_component_id,
        })
        if (!attachment) continue
        const normal = direction.x !== 0 ? "x" : "y"
        const tangent = normal === "x" ? "y" : "x"
        const reference =
          attachment.type === "lead"
            ? attachment.inner
            : tipAttachment
              ? local
              : body
        const limit = axes[normal].get(local[normal])!
        if (direction[normal] > 0)
          limit.lower = Math.max(limit.lower, reference[normal])
        else limit.upper = Math.min(limit.upper, reference[normal])
        if (attachment.type !== "lead") {
          const ends =
            attachment.type === "edge"
              ? [attachment.from[tangent], attachment.to[tangent]]
              : [
                  attachment.center[tangent] - attachment.radius,
                  attachment.center[tangent] + attachment.radius,
                ]
          const tangentLimit = axes[tangent].get(local[tangent])!
          tangentLimit.lower = Math.max(tangentLimit.lower, Math.min(...ends))
          tangentLimit.upper = Math.min(tangentLimit.upper, Math.max(...ends))
        }
      }
    }
    const localGrid = { x: placeAxis(axes.x), y: placeAxis(axes.y) }
    for (const pin of symbolPins) {
      pin.local = {
        x: localGrid.x.get(pin.local.x)!,
        y: localGrid.y.get(pin.local.y)!,
      }
      pinPlacements.push(pin)
    }
  }
  for (const trace of ctx.db.schematic_trace.list()) {
    for (const edge of trace.edges) {
      const from = sourcePoint(edge.from)
      const to = sourcePoint(edge.to)
      if (from.x !== to.x && from.y !== to.y) {
        throw new GridPlacementError(
          "Cannot align diagonal schematic wires without rerouting them.",
        )
      }
      add(from)
      add(to)
    }
    for (const point of trace.junctions) add(sourcePoint(point))
  }
  for (const label of ctx.db.schematic_net_label.list())
    add(sourcePoint(label.anchor_position ?? label.center))
  for (const text of ctx.db.schematic_text.list()) {
    if (!text.source_trace_id || !ctx.db.source_trace.get(text.source_trace_id))
      continue
    const anchor = sourcePoint(text.position)
    add(anchor)
    // Text keeps its physical size. Preserve the wire's available space on
    // both sides of an inline label so grid rounding cannot shorten its stub.
    for (const trace of ctx.db.schematic_trace.list()) {
      if (trace.source_trace_id !== text.source_trace_id) continue
      for (const edge of trace.edges) {
        const from = sourcePoint(edge.from)
        const to = sourcePoint(edge.to)
        const axis = from.x === to.x ? "y" : "x"
        const other = axis === "x" ? "y" : "x"
        const lower = Math.min(from[axis], to[axis])
        const upper = Math.max(from[axis], to[axis])
        if (
          anchor[other] !== from[other] ||
          anchor[axis] < lower ||
          anchor[axis] > upper
        )
          continue
        if (lower < anchor[axis]) labelSpans[axis].push([lower, anchor[axis]])
        if (anchor[axis] < upper) labelSpans[axis].push([anchor[axis], upper])
      }
    }
  }
  for (const port of ctx.db.schematic_port.list()) {
    if (ctx.db.source_port.get(port.source_port_id)?.do_not_connect)
      add(sourcePoint(port.center))
  }
  const x = placeSheetAxis(coordinates.x, pinPlacements, "x", labelSpans.x)
  const y = placeSheetAxis(coordinates.y, pinPlacements, "y", labelSpans.y)
  const grid = { x: x.coordinates, y: y.coordinates }
  const origins = new Map(
    [...x.origins].map(([id, value]) => [
      id,
      { x: value / 10_000, y: y.origins.get(id)! / 10_000 },
    ]),
  )
  const lengths = new Map<SymbolPin, number>()
  for (const { pin, local: point, direction, attachment } of pinPlacements) {
    if (!attachment || attachment.type === "lead") continue
    const normal = direction.x !== 0 ? "x" : "y"
    const tangent = normal === "x" ? "y" : "x"
    let contact: number
    if (attachment.type === "edge") {
      const fraction =
        (point[tangent] - attachment.from[tangent]) /
        (attachment.to[tangent] - attachment.from[tangent])
      contact =
        attachment.from[normal] +
        fraction * (attachment.to[normal] - attachment.from[normal])
    } else {
      contact =
        attachment.center[normal] +
        direction[normal] *
          Math.sqrt(
            attachment.radius ** 2 -
              (point[tangent] - attachment.center[tangent]) ** 2,
          )
    }
    const length = Math.round((point[normal] - contact) * direction[normal])
    if (length < 0)
      throw new GridPlacementError(
        "Grid placement would move a pin inside its symbol body.",
      )
    lengths.set(pin, length / 10_000)
  }
  // Commit the placement only after all connection and attachment checks pass.
  for (const { pin, local: point, attachment } of pinPlacements) {
    if (attachment?.type === "lead") {
      attachment.endpoint.x = point.x / 10_000
      attachment.endpoint.y = point.y / 10_000
    }
    if (lengths.has(pin)) pin.length = lengths.get(pin)!
    pin.at = [point.x / 10_000, point.y / 10_000, pin.at!.angle ?? 0]
  }
  return { grid, origins }
}
