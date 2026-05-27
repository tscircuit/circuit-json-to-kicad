import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Segment, SegmentNet } from "kicadts"
import {
  ConverterStage,
  type ConverterContext,
  type PcbNetInfo,
} from "../../types"
import { applyToPoint } from "transformation-matrix"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"
import { getKicadLayer } from "../utils/layerMapping"

type RoutePointPosition = { x: number; y: number }

type PcbTraceRoutePointWithPosition = {
  route_type: "wire" | "via"
  x: number
  y: number
  layer?: string
  width?: number
}

type PcbTraceThroughPadRoutePoint = {
  route_type: "through_pad"
  start: RoutePointPosition
  end: RoutePointPosition
  start_layer?: string
  end_layer?: string
  width?: number
}

type PcbTraceRoutePoint =
  | PcbTraceRoutePointWithPosition
  | PcbTraceThroughPadRoutePoint

function getRoutePointLayer(
  point: PcbTraceRoutePoint,
  pointRoleInSegment: "start" | "end",
): string | undefined {
  if ("layer" in point) {
    return point.layer
  }

  if (point.route_type === "through_pad") {
    if (pointRoleInSegment === "start") {
      return point.end_layer
    }

    return point.start_layer
  }

  return undefined
}

/**
 * Adds traces (segments/tracks) to the PCB from circuit JSON
 */
export class AddTracesStage extends ConverterStage<CircuitJson, KicadPcb> {
  private tracesProcessed = 0
  private pcbTraces: any[] = []

  constructor(input: CircuitJson, ctx: ConverterContext) {
    super(input, ctx)
    this.pcbTraces = this.ctx.db.pcb_trace.list()
  }

  private getRoutePointPosition(
    point: PcbTraceRoutePoint,
    pointRoleInSegment: "start" | "end",
  ): RoutePointPosition | null {
    if ("x" in point && "y" in point) {
      return { x: point.x, y: point.y }
    }

    if (point.route_type !== "through_pad") {
      return null
    }

    if (pointRoleInSegment === "start") {
      return { x: point.end.x, y: point.end.y }
    }

    return { x: point.start.x, y: point.start.y }
  }

  override _step(): void {
    const { kicadPcb, c2kMatPcb, pcbNetMap } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    if (!c2kMatPcb) {
      throw new Error("PCB transformation matrix not initialized in context")
    }

    if (this.tracesProcessed >= this.pcbTraces.length) {
      this.finished = true
      return
    }

    const trace = this.pcbTraces[this.tracesProcessed]

    // Skip traces without route information
    const route = trace.route as PcbTraceRoutePoint[] | undefined
    if (!route || route.length < 2) {
      this.tracesProcessed++
      return
    }

    let lastKnownLayer: string | undefined = getRoutePointLayer(
      route[0]!,
      "start",
    )

    // Create segments for each pair of points in the route
    for (let i = 0; i < route.length - 1; i++) {
      const startPoint = route[i]!
      const endPoint = route[i + 1]!
      const startPosition = this.getRoutePointPosition(startPoint, "start")
      const endPosition = this.getRoutePointPosition(endPoint, "end")

      if (!startPosition || !endPosition) {
        throw new Error(
          `Unable to convert pcb_trace route segment ${trace.pcb_trace_id ?? this.tracesProcessed}:${i} to KiCad segment`,
        )
      }

      // Transform points to KiCad coordinates
      const transformedStart = applyToPoint(c2kMatPcb, startPosition)
      const transformedEnd = applyToPoint(c2kMatPcb, endPosition)

      if (
        transformedStart.x === transformedEnd.x &&
        transformedStart.y === transformedEnd.y
      ) {
        continue
      }

      let netInfo: PcbNetInfo | undefined
      if (pcbNetMap) {
        let connectivityKey: string | undefined =
          trace.subcircuit_connectivity_map_key

        if (!connectivityKey && trace.source_trace_id) {
          const sourceTrace = this.ctx.db.source_trace?.get(
            trace.source_trace_id,
          )
          if (sourceTrace) {
            connectivityKey = sourceTrace.subcircuit_connectivity_map_key
            if (
              !connectivityKey &&
              sourceTrace.connected_source_net_ids?.length
            ) {
              for (const sourceNetId of sourceTrace.connected_source_net_ids) {
                const sourceNet = this.ctx.db.source_net?.get(sourceNetId)
                if (sourceNet?.subcircuit_connectivity_map_key) {
                  connectivityKey = sourceNet.subcircuit_connectivity_map_key
                  break
                }
              }
            }
          }
        }

        if (!connectivityKey && typeof trace.connection_name === "string") {
          const sourceNet = this.ctx.db.source_net?.get(trace.connection_name)
          if (sourceNet?.subcircuit_connectivity_map_key) {
            connectivityKey = sourceNet.subcircuit_connectivity_map_key
          }
        }

        if (connectivityKey) {
          netInfo = pcbNetMap.get(connectivityKey)
        }
      }

      const segmentLayerSource =
        getRoutePointLayer(startPoint, "start") ??
        getRoutePointLayer(endPoint, "end") ??
        lastKnownLayer

      // Map circuit JSON layer names to KiCad layer names
      const kicadLayer = getKicadLayer(segmentLayerSource)

      // Create a segment with deterministic UUID
      const segmentData = `segment:${transformedStart.x},${transformedStart.y}:${transformedEnd.x},${transformedEnd.y}:${kicadLayer}:${netInfo?.id ?? 0}`
      const segment = new Segment({
        start: { x: transformedStart.x, y: transformedStart.y },
        end: { x: transformedEnd.x, y: transformedEnd.y },
        layer: kicadLayer,
        width: startPoint.width ?? endPoint.width ?? trace.width ?? 0.25,
        net: new SegmentNet(netInfo?.id ?? 0),
        uuid: generateDeterministicUuid(segmentData),
      })

      // Add the segment to the PCB
      const segments = kicadPcb.segments
      segments.push(segment)
      kicadPcb.segments = segments

      const startLayer = getRoutePointLayer(startPoint, "start")
      const endLayer = getRoutePointLayer(endPoint, "end")

      if (startLayer) {
        lastKnownLayer = startLayer
      }
      if (endLayer) {
        lastKnownLayer = endLayer
      }
    }

    this.tracesProcessed++
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
