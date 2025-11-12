import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Segment, SegmentNet } from "kicadts"
import {
  ConverterStage,
  type ConverterContext,
  type PcbNetInfo,
} from "../../types"
import { applyToPoint } from "transformation-matrix"

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
    if (!trace.route || trace.route.length < 2) {
      this.tracesProcessed++
      return
    }

    // Create segments for each pair of points in the route
    for (let i = 0; i < trace.route.length - 1; i++) {
      const startPoint = trace.route[i]
      const endPoint = trace.route[i + 1]

      // Transform points to KiCad coordinates
      const transformedStart = applyToPoint(c2kMatPcb, {
        x: startPoint.x,
        y: startPoint.y,
      })
      const transformedEnd = applyToPoint(c2kMatPcb, {
        x: endPoint.x,
        y: endPoint.y,
      })

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

      // Map circuit JSON layer names to KiCad layer names
      const layerMap: Record<string, string> = {
        top: "F.Cu",
        bottom: "B.Cu",
      }
      const kicadLayer =
        layerMap[startPoint.layer] || startPoint.layer || "F.Cu"

      // Create a segment
      const segment = new Segment({
        start: { x: transformedStart.x, y: transformedStart.y },
        end: { x: transformedEnd.x, y: transformedEnd.y },
        layer: kicadLayer,
        width: trace.width || 0.25,
        net: new SegmentNet(netInfo?.id ?? 0, netInfo?.name),
      })

      // Add the segment to the PCB
      const segments = kicadPcb.segments
      segments.push(segment)
      kicadPcb.segments = segments
    }

    this.tracesProcessed++
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
