import type {
  CircuitJson,
  CadComponent,
  SourceComponentBase,
} from "circuit-json"
import { getKicadCompatibleComponentName } from "../../utils/getKicadCompatibleComponentName"
import type { KicadPcb } from "kicadts"
import {
  Footprint,
  FpText,
  FootprintModel,
  FpCircle,
  FpRect,
  Stroke,
  TextEffects,
  TextEffectsFont,
} from "kicadts"
import {
  ConverterStage,
  type ConverterContext,
  type PcbNetInfo,
} from "../../types"
import { applyToPoint, rotate, identity } from "transformation-matrix"
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

  /**
   * Gets the cad_component associated with a pcb_component
   */
  private getCadComponentForPcbComponent(
    pcbComponentId: string,
  ): CadComponent | undefined {
    const cadComponents = this.ctx.db.cad_component?.list() || []
    return cadComponents.find(
      (cad: CadComponent) => cad.pcb_component_id === pcbComponentId,
    )
  }

  /**
   * Creates FootprintModel instances from a cad_component's 3D model URLs
   */
  private create3DModelsFromCadComponent(
    cadComponent: CadComponent,
    componentCenter: { x: number; y: number },
  ): FootprintModel[] {
    const models: FootprintModel[] = []

    // Get the model URL - prefer STEP, fallback to WRL
    const modelUrl = cadComponent.model_step_url || cadComponent.model_wrl_url
    if (!modelUrl) return models

    // Create the FootprintModel with the URL path
    const model = new FootprintModel(modelUrl)

    // Calculate offset relative to footprint center
    // cad_component.position is world position, we need offset from footprint origin
    // KiCad Y-axis is flipped relative to circuit-json
    if (cadComponent.position) {
      model.offset = {
        x: (cadComponent.position.x || 0) - componentCenter.x,
        y: -((cadComponent.position.y || 0) - componentCenter.y),
        z: cadComponent.position.z || 0,
      }
    }

    // Apply rotation from cad_component if specified
    // KiCad uses degrees for rotation
    if (cadComponent.rotation) {
      model.rotate = {
        x: cadComponent.rotation.x || 0,
        y: cadComponent.rotation.y || 0,
        z: cadComponent.rotation.z || 0,
      }
    }

    // Apply scale factor if specified
    if (cadComponent.model_unit_to_mm_scale_factor) {
      const scale = cadComponent.model_unit_to_mm_scale_factor
      model.scale = { x: scale, y: scale, z: scale }
    }

    models.push(model)
    return models
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

    // Get the cad_component for footprinter_string
    const cadComponent = this.getCadComponentForPcbComponent(
      component.pcb_component_id,
    )

    // Generate ergonomic footprint name
    const footprintName = sourceComponent
      ? getKicadCompatibleComponentName(
          sourceComponent as SourceComponentBase,
          cadComponent,
        )
      : "Unknown"
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
        if (
          sourceComponent?.name &&
          textElement.text === sourceComponent.name
        ) {
          fpText.type = "reference"
        }
        fpTexts.push(fpText)
      }
    }

    // Add note text elements associated with this component (maps to F.Fab layer)
    const pcbNoteTexts =
      this.ctx.db.pcb_note_text
        ?.list()
        .filter(
          (text) => text.pcb_component_id === component.pcb_component_id,
        ) || []

    for (const textElement of pcbNoteTexts) {
      // Calculate position relative to component center
      const relX = textElement.anchor_position.x - component.center.x
      const relY = -(textElement.anchor_position.y - component.center.y) // Y is inverted in KiCad

      // Apply component rotation to position using transformation matrix
      const componentRotation = component.rotation || 0
      const rotationMatrix =
        componentRotation !== 0
          ? rotate((componentRotation * Math.PI) / 180)
          : identity()

      const rotatedPos = applyToPoint(rotationMatrix, { x: relX, y: relY })

      // Create text effects with font size
      const fontSize = textElement.font_size || 1
      const font = new TextEffectsFont()
      font.size = { width: fontSize, height: fontSize }
      const textEffects = new TextEffects({ font })

      const fpText = new FpText({
        type: "user",
        text: textElement.text,
        position: { x: rotatedPos.x, y: rotatedPos.y, angle: 0 },
        layer: "F.Fab",
        effects: textEffects,
      })
      fpTexts.push(fpText)
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
      })
      if (pad) {
        fpPads.push(pad)
      }
    }

    footprint.fpPads = fpPads

    // Add silkscreen circles from pcb_silkscreen_circle elements
    const pcbSilkscreenCircles =
      this.ctx.db.pcb_silkscreen_circle
        ?.list()
        .filter(
          (circle: any) =>
            circle.pcb_component_id === component.pcb_component_id,
        ) || []

    const fpCircles = footprint.fpCircles ?? []
    for (const circle of pcbSilkscreenCircles) {
      // Calculate position relative to component center
      const relX = circle.center.x - component.center.x
      const relY = -(circle.center.y - component.center.y) // Y is inverted in KiCad

      // Map circuit-json layer to KiCad layer
      const layerMap: Record<string, string> = {
        top: "F.SilkS",
        bottom: "B.SilkS",
      }
      const kicadLayer = layerMap[circle.layer] || circle.layer || "F.SilkS"

      // FpCircle uses center and end point (end defines the radius)
      const fpCircle = new FpCircle({
        center: { x: relX, y: relY },
        end: { x: relX + circle.radius, y: relY },
        layer: kicadLayer,
        stroke: new Stroke(),
        fill: false,
      })
      // Set stroke width
      if (fpCircle.stroke) {
        fpCircle.stroke.width = circle.stroke_width || 0.05
        fpCircle.stroke.type = "default"
      }
      fpCircles.push(fpCircle)
    }
    footprint.fpCircles = fpCircles

    // Add fabrication note rectangles from pcb_fabrication_note_rect elements
    const pcbFabRects =
      this.ctx.db.pcb_fabrication_note_rect
        ?.list()
        .filter(
          (rect: any) => rect.pcb_component_id === component.pcb_component_id,
        ) || []

    const fpRects = footprint.fpRects ?? []
    for (const rect of pcbFabRects) {
      // Calculate position relative to component center
      const relX = rect.center.x - component.center.x
      const relY = -(rect.center.y - component.center.y) // Y is inverted in KiCad
      const halfW = rect.width / 2
      const halfH = rect.height / 2

      // Map circuit-json layer to KiCad layer
      const layerMap: Record<string, string> = {
        top: "F.Fab",
        bottom: "B.Fab",
      }
      const kicadLayer = layerMap[rect.layer] || rect.layer || "F.Fab"

      // FpRect uses start and end corners
      const fpRect = new FpRect({
        start: { x: relX - halfW, y: relY - halfH },
        end: { x: relX + halfW, y: relY + halfH },
        layer: kicadLayer,
        stroke: new Stroke(),
        fill: false,
      })
      // Set stroke width
      if (fpRect.stroke) {
        fpRect.stroke.width = rect.stroke_width || 0.1
        fpRect.stroke.type = "default"
      }
      fpRects.push(fpRect)
    }

    // Add note rectangles from pcb_note_rect elements (maps to F.Fab layer)
    const pcbNoteRects =
      this.ctx.db.pcb_note_rect
        ?.list()
        .filter(
          (rect: any) => rect.pcb_component_id === component.pcb_component_id,
        ) || []

    for (const rect of pcbNoteRects) {
      // Calculate position relative to component center
      const relX = rect.center.x - component.center.x
      const relY = -(rect.center.y - component.center.y) // Y is inverted in KiCad
      const halfW = rect.width / 2
      const halfH = rect.height / 2

      // pcb_note_rect maps to F.Fab layer by default
      const kicadLayer = "F.Fab"

      const fpRect = new FpRect({
        start: { x: relX - halfW, y: relY - halfH },
        end: { x: relX + halfW, y: relY + halfH },
        layer: kicadLayer,
        stroke: new Stroke(),
        fill: false,
      })
      if (fpRect.stroke) {
        fpRect.stroke.width = rect.stroke_width || 0.1
        fpRect.stroke.type = "default"
      }
      fpRects.push(fpRect)
    }
    footprint.fpRects = fpRects

    // Add 3D models from cad_component if available
    // (cadComponent was already fetched earlier for footprint naming)
    if (cadComponent) {
      const models = this.create3DModelsFromCadComponent(
        cadComponent,
        component.center,
      )
      if (models.length > 0) {
        footprint.models = models
      }
    }

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
