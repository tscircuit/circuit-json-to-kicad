import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Footprint, FpText } from "kicadts"
import {
  ConverterStage,
  type ConverterContext,
  type PcbNetInfo,
} from "../../types"
import { applyToPoint } from "transformation-matrix"
import { createSmdPadFromCircuitJson } from "./utils/CreateSmdPadFromCircuitJson"
import { createThruHolePadFromCircuitJson } from "./utils/CreateThruHolePadFromCircuitJson"
import { createNpthPadFromCircuitJson } from "./utils/CreateNpthPadFromCircuitJson"
import { createFpTextFromCircuitJson } from "./utils/CreateFpTextFromCircuitJson"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"

/**
 * Adds footprints to the PCB from circuit JSON components
 */
export class AddFootprintsStage extends ConverterStage<CircuitJson, KicadPcb> {
  private componentsProcessed = 0
  private pcbComponents: any[] = []

  private getNetInfoForPcbPort(pcbPortId?: string): PcbNetInfo | undefined {
    if (!pcbPortId) return undefined
    const pcbPort = this.ctx.db.pcb_port?.get(pcbPortId)
    if (!pcbPort) return undefined

    const sourcePortId = pcbPort.source_port_id
    if (!sourcePortId) return undefined

    const sourcePort = this.ctx.db.source_port?.get(sourcePortId)
    if (!sourcePort) return undefined

    const connectivityKey = sourcePort.subcircuit_connectivity_map_key
    if (!connectivityKey) return undefined

    return this.ctx.pcbNetMap?.get(connectivityKey)
  }

  constructor(input: CircuitJson, ctx: ConverterContext) {
    super(input, ctx)
    // Get all PCB components from circuit JSON
    this.pcbComponents = this.ctx.db.pcb_component.list()
  }

  override _step(): void {
    const { kicadPcb, c2kMatPcb } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    if (!c2kMatPcb) {
      throw new Error("PCB transformation matrix not initialized in context")
    }

    if (this.componentsProcessed >= this.pcbComponents.length) {
      this.finished = true
      return
    }

    const component = this.pcbComponents[this.componentsProcessed]

    // Get the source component to find the footprint type
    const sourceComponent = component.source_component_id
      ? this.ctx.db.source_component.get(component.source_component_id)
      : null

    const footprintName = sourceComponent?.ftype || "Unknown"
    // Transform the component position to KiCad coordinates
    const transformedPos = applyToPoint(c2kMatPcb, {
      x: component.center.x,
      y: component.center.y,
    })

    // Create a footprint with deterministic UUID
    const footprintData = `footprint:${component.pcb_component_id}:${transformedPos.x},${transformedPos.y}`
    const footprint = new Footprint({
      libraryLink: `tscircuit:${footprintName}`,
      layer: "F.Cu",
      at: [transformedPos.x, transformedPos.y, component.rotation || 0],
      uuid: generateDeterministicUuid(footprintData),
    })

    // fpTexts is a getter/setter, so we need to get, modify, and set
    const fpTexts = footprint.fpTexts

    // Add silkscreen text elements associated with this component
    const pcbSilkscreenTexts =
      this.ctx.db.pcb_silkscreen_text
        ?.list()
        .filter(
          (text: any) => text.pcb_component_id === component.pcb_component_id,
        ) || []

    for (const textElement of pcbSilkscreenTexts) {
      const fpText = createFpTextFromCircuitJson({
        textElement,
        componentCenter: component.center,
        componentRotation: component.rotation || 0,
      })
      if (fpText) {
        fpTexts.push(fpText)
      }
    }

    footprint.fpTexts = fpTexts

    // Add pads from pcb_smtpad elements
    const pcbPads =
      this.ctx.db.pcb_smtpad
        ?.list()
        .filter(
          (pad: any) => pad.pcb_component_id === component.pcb_component_id,
        ) || []

    const fpPads = footprint.fpPads
    let padNumber = 1

    // Convert SMD pads
    for (const pcbPad of pcbPads) {
      const netInfo = this.getNetInfoForPcbPort(pcbPad.pcb_port_id)
      const pad = createSmdPadFromCircuitJson({
        pcbPad,
        componentCenter: component.center,
        padNumber,
        componentRotation: component.rotation || 0,
        netInfo,
        componentId: component.pcb_component_id,
      })
      fpPads.push(pad)
      padNumber++
    }

    // Add pads from pcb_plated_hole elements
    const pcbPlatedHoles =
      this.ctx.db.pcb_plated_hole
        ?.list()
        .filter(
          (hole: any) => hole.pcb_component_id === component.pcb_component_id,
        ) || []

    // Convert plated holes to through-hole pads
    for (const platedHole of pcbPlatedHoles) {
      const netInfo = this.getNetInfoForPcbPort(platedHole.pcb_port_id)
      const pad = createThruHolePadFromCircuitJson({
        platedHole,
        componentCenter: component.center,
        padNumber,
        componentRotation: component.rotation || 0,
        netInfo,
        componentId: component.pcb_component_id,
      })
      if (pad) {
        fpPads.push(pad)
        padNumber++
      }
    }

    // Add non-plated holes (pcb_hole elements)
    const pcbHoles =
      this.ctx.db.pcb_hole
        ?.list()
        .filter(
          (hole: any) => hole.subcircuit_id === component.subcircuit_id,
        ) || []

    // Convert non-plated holes to NPTH pads
    for (const pcbHole of pcbHoles) {
      const pad = createNpthPadFromCircuitJson({
        pcbHole,
        componentCenter: component.center,
        componentRotation: component.rotation || 0,
        componentId: component.pcb_component_id,
      })
      if (pad) {
        fpPads.push(pad)
      }
    }

    footprint.fpPads = fpPads

    // Add the footprint to the PCB
    // Note: footprints is a getter/setter, so we need to get, modify, and set
    const footprints = kicadPcb.footprints
    footprints.push(footprint)
    kicadPcb.footprints = footprints

    this.componentsProcessed++
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
