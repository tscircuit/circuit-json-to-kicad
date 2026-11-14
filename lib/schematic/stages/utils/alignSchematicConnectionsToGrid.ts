import type { Point, SchematicComponent } from "circuit-json"
import type { SchematicSymbol, SymbolPin } from "kicadts"
import {
  SymbolRectangleStart,
  SymbolRectangleEnd,
  SymbolCircleCenter,
  SymbolCircleRadius,
} from "kicadts"
import {
  applyToPoint,
  compose,
  scale,
  translate,
  type Matrix,
} from "transformation-matrix"
import type { ConverterContext } from "../../../types"
import {
  getSymbolArcAttachment,
  type SymbolArcAttachment,
} from "./getSymbolArcAttachment"
import {
  fromSchematicInternalUnits,
  toSchematicInternalUnits,
  transformSchematicPoint,
  type SchematicConnectionGrid,
} from "./schematicCoordinates"

// KiCad's default connection grid is 50 mil. Work in its integer schematic
// units so equality, ordering, and grid membership do not need tolerances.
const KICAD_CONNECTION_GRID_INTERNAL_UNITS = toSchematicInternalUnits(1.27)
const toSchematicPointInternalUnits = (point: Point): Point => ({
  x: toSchematicInternalUnits(point.x),
  y: toSchematicInternalUnits(point.y),
})
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y

type SchematicComponentId = SchematicComponent["schematic_component_id"]

type AxisPoint = { lower: number; upper: number }
type Attachment =
  | { type: "lead"; endpoints: Point[]; inner: Point }
  | { type: "edge"; from: Point; to: Point }
  | { type: "circle"; center: Point; radius: number }
  | SymbolArcAttachment

function isPointOnSegment({
  point,
  from,
  to,
}: {
  point: Point
  from: Point
  to: Point
}): boolean {
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

function findEdgeAttachment({
  point,
  direction,
  from,
  to,
}: {
  point: Point
  direction: Point
  from: Point
  to: Point
}): Attachment | undefined {
  if (!isPointOnSegment({ point, from, to })) return undefined
  // The pin must enter the edge rather than run along it.
  if (direction.x !== 0 ? from.y === to.y : from.x === to.x) return undefined
  return { type: "edge", from, to }
}

function findAttachment({
  symbol,
  point,
  direction,
}: {
  symbol: SchematicSymbol
  point: Point
  direction: Point
}): Attachment | undefined {
  const leads: Extract<Attachment, { type: "lead" }>[] = []
  for (const unit of symbol.subSymbols) {
    for (const polyline of unit.polylines) {
      const vertices = polyline.points?.points ?? []
      const points = vertices.filter(
        (vertex): vertex is typeof vertex & Point =>
          "x" in vertex && "y" in vertex,
      )
      if (points.length !== vertices.length || points.length < 2) continue
      const first = toSchematicPointInternalUnits(points[0]!)
      const last = toSchematicPointInternalUnits(points.at(-1)!)
      const filled = polyline.fill?.type && polyline.fill.type !== "none"
      const open = !samePoint(first, last) && !filled
      if (open) {
        if (samePoint(first, point))
          leads.push({
            type: "lead",
            endpoints: [points[0]!],
            inner: toSchematicPointInternalUnits(points[1]!),
          })
        if (samePoint(last, point))
          leads.push({
            type: "lead",
            endpoints: [points.at(-1)!],
            inner: toSchematicPointInternalUnits(points.at(-2)!),
          })
      }
      for (let index = 1; index < points.length; index++) {
        // A slanted lead is still a lead; do not mistake its free endpoint
        // for an edge of the body merely because the stroke is not horizontal.
        if (
          open &&
          ((index === 1 && samePoint(first, point)) ||
            (index === points.length - 1 && samePoint(last, point)))
        )
          continue
        const found = findEdgeAttachment({
          point,
          direction,
          from: toSchematicPointInternalUnits(points[index - 1]!),
          to: toSchematicPointInternalUnits(points[index]!),
        })
        if (found) return found
      }
      if (filled) {
        const found = findEdgeAttachment({
          point,
          direction,
          from: last,
          to: first,
        })
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
      const from = toSchematicPointInternalUnits(start)
      const to = toSchematicPointInternalUnits(end)
      const corners = [
        from,
        { x: to.x, y: from.y },
        to,
        { x: from.x, y: to.y },
        from,
      ]
      for (let index = 1; index < corners.length; index++) {
        const found = findEdgeAttachment({
          point,
          direction,
          from: corners[index - 1]!,
          to: corners[index]!,
        })
        if (found) return found
      }
    }
    for (const circle of unit.circles) {
      const centerPoint = circle
        .getChildren()
        .find((child) => child instanceof SymbolCircleCenter)
      const circleRadius = circle
        .getChildren()
        .find((child) => child instanceof SymbolCircleRadius)
      if (!centerPoint || !circleRadius) continue
      const center = toSchematicPointInternalUnits(centerPoint)
      const radius = toSchematicInternalUnits(circleRadius.value)
      // Compare the radial distance at KiCad's native coordinate resolution.
      if (
        Math.round(Math.hypot(point.x - center.x, point.y - center.y)) ===
        radius
      ) {
        return { type: "circle", center, radius }
      }
    }
    for (const arc of unit.arcs) {
      const attachment = getSymbolArcAttachment({ arc, point, direction })
      if (attachment) return attachment
    }
  }
  // Explicit schematic lines and generated stems can describe the same lead.
  // Move every copy together, but reject a vertex shared by different strokes.
  const lead = leads[0]
  if (leads.some((candidate) => !samePoint(candidate.inner, lead!.inner)))
    throw new GridPlacementError(
      "A pin meets multiple drawing strokes; its stem cannot move without changing the symbol body.",
    )
  if (lead) lead.endpoints = leads.flatMap((candidate) => candidate.endpoints)
  return lead
}

class GridPlacementError extends Error {}

type PinPlacement = {
  pin: SymbolPin
  position: Point
  direction: Point
  componentId: SchematicComponentId
  attachment?: Attachment
  local: Point
  origin: Point
  bounds: Record<"x" | "y", AxisPoint>
}

/** Solve pin positions and instance origins together. Attachment bounds keep
 * pins outside the unchanged bodies and on their edges. Separation constraints
 * keep distinct contacts apart without requiring a different row for every
 * unrelated coordinate in the sheet. A positive cycle is an impossible layout.
 */
function placeSheetAxis({
  coordinates,
  pins,
  axis,
  labelSpans,
  separations,
}: {
  coordinates: Set<number>
  pins: PinPlacement[]
  axis: "x" | "y"
  labelSpans: [number, number][]
  separations: [number, number][]
}) {
  const sorted = [...coordinates].sort((a, b) => a - b)
  if (sorted.length === 0) {
    return {
      coordinates: new Map<number, number>(),
      origins: new Map<SchematicComponentId, number>(),
    }
  }
  const indices = new Map(
    sorted.map((coordinate, index) => [coordinate, index]),
  )
  const positions = sorted.map((coordinate) =>
    Math.round(coordinate / KICAD_CONNECTION_GRID_INTERNAL_UNITS),
  )
  // Prefer the same local layout for identical symbols, while retaining
  // connections that are already on the sheet grid, even at fractional origins.
  const preferred = new Map<number, number>()
  for (const pin of pins) {
    if (pin.position[axis] % KICAD_CONNECTION_GRID_INTERNAL_UNITS === 0)
      continue
    const pointIndex = indices.get(pin.position[axis])!
    const position =
      Math.round(pin.origin[axis] / KICAD_CONNECTION_GRID_INTERNAL_UNITS) +
      Math.round(pin.local[axis] / KICAD_CONNECTION_GRID_INTERNAL_UNITS) *
        (axis === "y" ? -1 : 1)
    preferred.set(
      pointIndex,
      Math.max(position, preferred.get(pointIndex) ?? -Infinity),
    )
  }
  for (const [index, position] of preferred) positions[index] = position
  const origins = new Map<SchematicComponentId, number>()
  const constraints: { from: number; to: number; distance: number }[] = []
  for (let index = 1; index < sorted.length; index++) {
    constraints.push({ from: index - 1, to: index, distance: 0 })
  }
  for (const [from, to] of separations) {
    constraints.push({
      from: indices.get(from)!,
      to: indices.get(to)!,
      distance: 1,
    })
  }
  for (const [from, to] of labelSpans) {
    constraints.push({
      from: indices.get(from)!,
      to: indices.get(to)!,
      distance: Math.ceil((to - from) / KICAD_CONNECTION_GRID_INTERNAL_UNITS),
    })
  }
  for (const pin of pins) {
    let originIndex = origins.get(pin.componentId)
    if (originIndex === undefined) {
      originIndex = positions.length
      origins.set(pin.componentId, originIndex)
      positions.push(
        Math.round(pin.origin[axis] / KICAD_CONNECTION_GRID_INTERNAL_UNITS),
      )
    }
    const pointIndex = indices.get(pin.position[axis])!
    const bounds = pin.bounds[axis]
    const lower = Math.ceil(
      (axis === "x" ? bounds.lower : -bounds.upper) /
        KICAD_CONNECTION_GRID_INTERNAL_UNITS,
    )
    const upper = Math.floor(
      (axis === "x" ? bounds.upper : -bounds.lower) /
        KICAD_CONNECTION_GRID_INTERNAL_UNITS,
    )
    if (Number.isFinite(lower))
      constraints.push({ from: originIndex, to: pointIndex, distance: lower })
    if (Number.isFinite(upper))
      constraints.push({ from: pointIndex, to: originIndex, distance: -upper })
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
          sorted.map((coordinate, index) => [
            coordinate,
            positions[index]! * KICAD_CONNECTION_GRID_INTERNAL_UNITS,
          ]),
        ),
        origins: new Map(
          [...origins].map(([id, index]) => [
            id,
            positions[index]! * KICAD_CONNECTION_GRID_INTERNAL_UNITS,
          ]),
        ),
      }
  }
  throw new GridPlacementError(
    "Cannot fit schematic connections on KiCad's 1.27 mm grid without changing symbol bodies or rerouting wires.",
  )
}

function transformSourcePointToInternalUnits({
  transform,
  point,
}: {
  transform: Matrix
  point: Point
}): Point {
  return toSchematicPointInternalUnits(
    transformSchematicPoint(transform, point),
  )
}

type ConnectionCoordinates = {
  x: Set<number>
  y: Set<number>
  points: Map<number, Map<number, Point>>
  segments: { from: Point; to: Point }[]
}

/** Keep distinct points and point/wire pairs apart on a separating axis.
 * Distant wiring can share a row or column; electrical contacts cannot merge.
 */
function getConnectionSeparations(coordinates: ConnectionCoordinates) {
  const separations = {
    x: new Map<number, number>(),
    y: new Map<number, number>(),
  }
  const points = [...coordinates.points.values()].flatMap((column) => [
    ...column.values(),
  ])
  for (let index = 0; index < points.length; index++) {
    const point = points[index]!
    for (const other of points.slice(index + 1)) {
      addConnectionSeparation({ point, from: other, to: other, separations })
    }
    for (const segment of coordinates.segments) {
      addConnectionSeparation({ point, ...segment, separations })
    }
  }
  // Monotone coordinates make intervals containing another separation redundant.
  const spans: Record<"x" | "y", [number, number][]> = { x: [], y: [] }
  for (const axis of ["x", "y"] as const) {
    let next = Number.POSITIVE_INFINITY
    for (const [from, to] of [...separations[axis]].sort(([a], [b]) => b - a)) {
      if (to >= next) continue
      spans[axis].push([from, to])
      next = to
    }
  }
  return spans
}

function addConnectionSeparation({
  point,
  from,
  to,
  separations,
}: {
  point: Point
  from: Point
  to: Point
  separations: Record<"x" | "y", Map<number, number>>
}): void {
  const nearest = {
    x: Math.max(
      Math.min(from.x, to.x),
      Math.min(point.x, Math.max(from.x, to.x)),
    ),
    y: Math.max(
      Math.min(from.y, to.y),
      Math.min(point.y, Math.max(from.y, to.y)),
    ),
  }
  if (samePoint(point, nearest)) return
  const axis =
    Math.abs(point.x - nearest.x) >= Math.abs(point.y - nearest.y) ? "x" : "y"
  const lower = Math.min(point[axis], nearest[axis])
  const upper = Math.max(point[axis], nearest[axis])
  separations[axis].set(
    lower,
    Math.min(upper, separations[axis].get(lower) ?? Infinity),
  )
}

function placeConnectionPoint({
  point,
  grid,
}: {
  point: Point
  grid: SchematicConnectionGrid
}): Point {
  return { x: grid.x.get(point.x)!, y: grid.y.get(point.y)! }
}

/** Diagonal wires are allowed when their contacts survive grid placement.
 * Check all wires as well, so a changed separation rule cannot silently join
 * separate nets or disconnect a pin, label, endpoint, or junction.
 */
function validateConnectionPlacement({
  coordinates,
  grid,
}: {
  coordinates: ConnectionCoordinates
  grid: SchematicConnectionGrid
}): void {
  for (const column of coordinates.points.values()) {
    for (const point of column.values()) {
      const placedPoint = placeConnectionPoint({ point, grid })
      for (const { from, to } of coordinates.segments) {
        const connected = isPointOnSegment({ point, from, to })
        const remainsConnected = isPointOnSegment({
          point: placedPoint,
          from: placeConnectionPoint({ point: from, grid }),
          to: placeConnectionPoint({ point: to, grid }),
        })
        if (connected !== remainsConnected)
          throw new GridPlacementError(
            "Grid placement would change a wire connection. Reroute the wire before exporting.",
          )
      }
    }
  }
}

function addConnectionCoordinates({
  coordinates,
  point,
}: {
  coordinates: ConnectionCoordinates
  point: Point
}): void {
  coordinates.x.add(point.x)
  coordinates.y.add(point.y)
  let column = coordinates.points.get(point.x)
  if (!column) coordinates.points.set(point.x, (column = new Map()))
  column.set(point.y, point)
}

/** Align electrical contacts to KiCad's 1.27 mm connection grid while keeping
 * symbol bodies and connectivity intact. Pin stems can change length; wires
 * and labels move with their connection points.
 *
 * Placement errors propagate to the caller. There is no general wire rerouting
 * or symbol-body resizing: two distinct pin contacts cannot fit along a body
 * edge shorter than one grid interval. Such source geometry needs adjustment
 * before export; returning the original off-grid coordinates would hide this.
 */
export function alignSchematicConnectionsToGrid(
  {
    components,
  }: {
    components: { component: SchematicComponent; symbol: SchematicSymbol }[]
  },
  ctx: ConverterContext,
): {
  grid: SchematicConnectionGrid
  origins: Map<SchematicComponentId, Point>
} {
  const coordinates: ConnectionCoordinates = {
    x: new Set(),
    y: new Set(),
    points: new Map(),
    segments: [],
  }
  const labelSpans: Record<"x" | "y", [number, number][]> = { x: [], y: [] }
  const pinPlacements: PinPlacement[] = []
  for (const { component, symbol } of components) {
    const origin = transformSourcePointToInternalUnits({
      transform: ctx.c2kMatSch!,
      point: component.center,
    })
    const symbolToSheet = compose(translate(origin.x, origin.y), scale(1, -1))
    const axes = {
      x: new Map<number, AxisPoint>(),
      y: new Map<number, AxisPoint>(),
    }
    const symbolPins: PinPlacement[] = []
    for (const unit of symbol.subSymbols) {
      for (const pin of unit.pins) {
        if (!pin.at) continue
        const local = toSchematicPointInternalUnits(pin.at)
        for (const axis of ["x", "y"] as const) {
          if (!axes[axis].has(local[axis]))
            axes[axis].set(local[axis], {
              lower: Number.NEGATIVE_INFINITY,
              upper: Number.POSITIVE_INFINITY,
            })
        }
        const angle = (((pin.at.angle ?? 0) % 360) + 360) % 360
        // KiCad's symbol-pin format only supports the four cardinal orientations.
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
            `KiCad only supports pin angles of 0, 90, 180, or 270 degrees; received ${angle}.`,
          )
        const position = applyToPoint(symbolToSheet, local)
        addConnectionCoordinates({ coordinates, point: position })
        const pinLength = toSchematicInternalUnits(pin.length ?? 0)
        const body = applyToPoint(
          translate(-direction.x * pinLength, -direction.y * pinLength),
          local,
        )
        const tipAttachment = findAttachment({
          symbol,
          point: local,
          direction,
        })
        const attachment =
          tipAttachment ?? findAttachment({ symbol, point: body, direction })
        symbolPins.push({
          pin,
          position,
          direction,
          attachment,
          local,
          origin,
          bounds: { x: axes.x.get(local.x)!, y: axes.y.get(local.y)! },
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
        const normalBounds = axes[normal].get(local[normal])!
        if (direction[normal] > 0)
          normalBounds.lower = Math.max(normalBounds.lower, reference[normal])
        else
          normalBounds.upper = Math.min(normalBounds.upper, reference[normal])
        if (attachment.type !== "lead") {
          const ends =
            attachment.type === "edge"
              ? [attachment.from[tangent], attachment.to[tangent]]
              : attachment.type === "arc"
                ? [
                    attachment.tangentBounds.lower,
                    attachment.tangentBounds.upper,
                  ]
                : [
                    attachment.center[tangent] - attachment.radius,
                    attachment.center[tangent] + attachment.radius,
                  ]
          const tangentBounds = axes[tangent].get(local[tangent])!
          tangentBounds.lower = Math.max(tangentBounds.lower, Math.min(...ends))
          tangentBounds.upper = Math.min(tangentBounds.upper, Math.max(...ends))
        }
      }
    }
    pinPlacements.push(...symbolPins)
  }
  for (const trace of ctx.db.schematic_trace.list()) {
    for (const edge of trace.edges) {
      const from = transformSourcePointToInternalUnits({
        transform: ctx.c2kMatSch!,
        point: edge.from,
      })
      const to = transformSourcePointToInternalUnits({
        transform: ctx.c2kMatSch!,
        point: edge.to,
      })
      coordinates.segments.push({ from, to })
      addConnectionCoordinates({ coordinates, point: from })
      addConnectionCoordinates({ coordinates, point: to })
    }
    for (const point of trace.junctions)
      addConnectionCoordinates({
        coordinates,
        point: transformSourcePointToInternalUnits({
          transform: ctx.c2kMatSch!,
          point,
        }),
      })
  }
  for (const label of ctx.db.schematic_net_label.list())
    addConnectionCoordinates({
      coordinates,
      point: transformSourcePointToInternalUnits({
        transform: ctx.c2kMatSch!,
        point: label.anchor_position ?? label.center,
      }),
    })
  for (const text of ctx.db.schematic_text.list()) {
    if (!text.source_trace_id || !ctx.db.source_trace.get(text.source_trace_id))
      continue
    const anchor = transformSourcePointToInternalUnits({
      transform: ctx.c2kMatSch!,
      point: text.position,
    })
    addConnectionCoordinates({ coordinates, point: anchor })
    // Text keeps its physical size. Preserve the wire's available space on
    // both sides of an inline label so grid rounding cannot shorten its stub.
    for (const trace of ctx.db.schematic_trace.list()) {
      if (trace.source_trace_id !== text.source_trace_id) continue
      for (const edge of trace.edges) {
        const from = transformSourcePointToInternalUnits({
          transform: ctx.c2kMatSch!,
          point: edge.from,
        })
        const to = transformSourcePointToInternalUnits({
          transform: ctx.c2kMatSch!,
          point: edge.to,
        })
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
      addConnectionCoordinates({
        coordinates,
        point: transformSourcePointToInternalUnits({
          transform: ctx.c2kMatSch!,
          point: port.center,
        }),
      })
  }
  const separations = getConnectionSeparations(coordinates)
  const x = placeSheetAxis({
    coordinates: coordinates.x,
    pins: pinPlacements,
    axis: "x",
    labelSpans: labelSpans.x,
    separations: separations.x,
  })
  const y = placeSheetAxis({
    coordinates: coordinates.y,
    pins: pinPlacements,
    axis: "y",
    labelSpans: labelSpans.y,
    separations: separations.y,
  })
  const grid = { x: x.coordinates, y: y.coordinates }
  validateConnectionPlacement({ coordinates, grid })
  const origins = new Map(
    [...x.origins].map(([id, xCoordinate]) => [
      id,
      {
        x: fromSchematicInternalUnits(xCoordinate),
        y: fromSchematicInternalUnits(y.origins.get(id)!),
      },
    ]),
  )
  for (const pin of pinPlacements) {
    const origin = origins.get(pin.componentId)!
    pin.local = applyToPoint(
      compose(
        scale(1, -1),
        translate(
          -toSchematicInternalUnits(origin.x),
          -toSchematicInternalUnits(origin.y),
        ),
      ),
      { x: grid.x.get(pin.position.x)!, y: grid.y.get(pin.position.y)! },
    )
  }
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
        (attachment.type === "arc"
          ? attachment.normalSign
          : direction[normal]) *
          // Tangent bounds keep this on the circle. At exact tangency,
          // floating-point subtraction can leave a tiny negative radicand.
          Math.sqrt(
            Math.max(
              0,
              attachment.radius ** 2 -
                (point[tangent] - attachment.center[tangent]) ** 2,
            ),
          )
    }
    const length = Math.round((point[normal] - contact) * direction[normal])
    if (!Number.isFinite(length) || length < 0)
      throw new GridPlacementError(
        "Grid placement would move a pin inside its symbol body.",
      )
    lengths.set(pin, fromSchematicInternalUnits(length))
  }
  // Commit the placement only after all connection and attachment checks pass.
  for (const { pin, local: point, attachment } of pinPlacements) {
    if (attachment?.type === "lead") {
      for (const endpoint of attachment.endpoints) {
        endpoint.x = fromSchematicInternalUnits(point.x)
        endpoint.y = fromSchematicInternalUnits(point.y)
      }
    }
    if (lengths.has(pin)) pin.length = lengths.get(pin)!
    pin.at = [
      fromSchematicInternalUnits(point.x),
      fromSchematicInternalUnits(point.y),
      pin.at!.angle ?? 0,
    ]
  }
  return { grid, origins }
}
