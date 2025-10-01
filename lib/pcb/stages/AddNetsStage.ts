import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { PcbNet } from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"

/**
 * Adds nets to the PCB from circuit JSON connections
 */
export class AddNetsStage extends ConverterStage<CircuitJson, KicadPcb> {
  override _step(): void {
    const { kicadPcb } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    // Initialize the net map in context if it doesn't exist
    if (!this.ctx.pcbNetMap) {
      this.ctx.pcbNetMap = new Map()
    }

    // Get all PCB traces to identify unique nets
    const pcbTraces = this.ctx.db.pcb_trace.list()

    // Collect unique net names
    const netNames = new Set<string>()

    // Add ground net (net 0 is always the ground/no-net in KiCad)
    netNames.add("GND")

    // Extract net names from traces
    for (const trace of pcbTraces) {
      // Use trace route as a basis for net naming, or generate from connected ports
      if (trace.route && trace.route.length > 0) {
        // Create a net name based on the trace ID or connected components
        const netName = `Net-${trace.pcb_trace_id}`
        netNames.add(netName)
      }
    }

    // Add nets to the PCB
    let netNumber = 0
    for (const netName of Array.from(netNames).sort()) {
      const net = new PcbNet(netNumber, netName)
      const nets = kicadPcb.nets
      nets.push(net)
      kicadPcb.nets = nets

      // Store in the net map for use by other stages
      this.ctx.pcbNetMap.set(netName, netNumber)
      netNumber++
    }

    this.finished = true
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
