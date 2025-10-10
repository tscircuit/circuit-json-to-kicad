import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Footprint, FpText } from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"
import { applyToPoint } from "transformation-matrix"
import { createSmdPadFromCircuitJson } from "./utils/CreateSmdPadFromCircuitJson"
import { createThruHolePadFromCircuitJson } from "./utils/CreateThruHolePadFromCircuitJson"
import { createNpthPadFromCircuitJson } from "./utils/CreateNpthPadFromCircuitJson"
import { createFpTextFromCircuitJson } from "./utils/CreateFpTextFromCircuitJson"

/**
 * Adds footprints to the PCB from circuit JSON components
 */
export class AddFootprintsStage extends ConverterStage<CircuitJson, KicadPcb> {
  private componentsProcessed = 0
  private pcbComponents: any[] = []

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
    const componentName =
      sourceComponent?.name || `Component_${this.componentsProcessed}`

    // Transform the component position to KiCad coordinates
    const transformedPos = applyToPoint(c2kMatPcb, {
      x: component.center.x,
      y: component.center.y,
    })

    // Create a footprint with UUID and required properties
    const footprint = new Footprint({
      libraryLink: `tscircuit:${footprintName}`,
      layer: "F.Cu",
      at: [transformedPos.x, transformedPos.y, component.rotation || 0],
      uuid: crypto.randomUUID(),
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
      const pad = createSmdPadFromCircuitJson({
        pcbPad,
        componentCenter: component.center,
        padNumber,
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
      const pad = createThruHolePadFromCircuitJson({
        platedHole,
        componentCenter: component.center,
        padNumber,
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
