import type { CircuitJson } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Footprint, At, Property, FpText, FootprintPad } from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"
import { applyToPoint } from "transformation-matrix"

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

    // Add required Reference and Value fp_text elements
    const refText = new FpText({
      type: "reference",
      text: componentName,
      position: [0, -1.5, 0],
      layer: "F.SilkS",
      uuid: crypto.randomUUID(),
    })

    const valueText = new FpText({
      type: "value",
      text: footprintName,
      position: [0, 1.5, 0],
      layer: "F.Fab",
      uuid: crypto.randomUUID(),
    })

    // fpTexts is a getter/setter, so we need to get, modify, and set
    const fpTexts = footprint.fpTexts
    fpTexts.push(refText)
    fpTexts.push(valueText)
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
    for (const pcbPad of pcbPads) {
      if (!("x" in pcbPad && "y" in pcbPad)) {
        throw new Error("no support for polygon pads (or any pads w/o X/Y) yet")
      }
      // Calculate pad position relative to component center
      const relativeX = pcbPad.x - component.center.x
      const relativeY = pcbPad.y - component.center.y

      // Map layer names
      const layerMap: Record<string, string> = {
        top: "F.Cu",
        bottom: "B.Cu",
      }
      const padLayer = layerMap[pcbPad.layer] || "F.Cu"

      // Handle different pad shapes (circle pads have radius, rect pads have width/height)
      const padShape = pcbPad.shape === "circle" ? "circle" : "rect"
      const padSize: [number, number] =
        pcbPad.shape === "circle"
          ? [
              "radius" in pcbPad ? pcbPad.radius * 2 : 0.5,
              "radius" in pcbPad ? pcbPad.radius * 2 : 0.5,
            ]
          : [
              "width" in pcbPad ? pcbPad.width : 0.5,
              "height" in pcbPad ? pcbPad.height : 0.5,
            ]

      const pad = new FootprintPad({
        number: String(padNumber),
        padType: "smd",
        shape: padShape,
        at: [relativeX, relativeY, 0],
        size: padSize,
        layers: [
          `${padLayer}`,
          `${padLayer === "F.Cu" ? "F" : "B"}.Paste`,
          `${padLayer === "F.Cu" ? "F" : "B"}.Mask`,
        ],
        uuid: crypto.randomUUID(),
      })

      fpPads.push(pad)
      padNumber++
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
