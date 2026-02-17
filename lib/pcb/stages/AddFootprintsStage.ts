import type {
  CircuitJson,
  CadComponent,
  SourceComponentBase,
} from "circuit-json"
import { getKicadCompatibleComponentName } from "../../utils/getKicadCompatibleComponentName"
import type { KicadPcb } from "kicadts"
import {
  Footprint,
  Property,
  TextEffects,
  TextEffectsFont,
  EmbeddedFonts,
  FootprintModel,
  FootprintAttr,
} from "kicadts"
import {
  ConverterStage,
  type ConverterContext,
  type PcbNetInfo,
} from "../../types"
import { applyToPoint } from "transformation-matrix"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"
import type { KicadFootprintMetadata, KicadEffects } from "@tscircuit/props"
import { convertSilkscreenCircles } from "./footprints-stage-converters/convertSilkscreenCircles"
import { convertCourtyardCircles } from "./footprints-stage-converters/convertCourtyardCircles"
import { convertFabricationNoteRects } from "./footprints-stage-converters/convertFabricationNoteRects"
import { convertNoteRects } from "./footprints-stage-converters/convertNoteRects"
import { convertCourtyardRects } from "./footprints-stage-converters/convertCourtyardRects"
import { convertCourtyardOutlines } from "./footprints-stage-converters/convertCourtyardOutlines"
import { convertSilkscreenTexts } from "./footprints-stage-converters/convertSilkscreenTexts"
import { convertNoteTexts } from "./footprints-stage-converters/convertNoteTexts"
import { create3DModelsFromCadComponent } from "./footprints-stage-converters/create3DModelsFromCadComponent"
import { convertSmdPads } from "./footprints-stage-converters/convertSmdPads"
import { convertPlatedHoles } from "./footprints-stage-converters/convertPlatedHoles"
import { convertNpthHoles } from "./footprints-stage-converters/convertNpthHoles"
import { extractReferencePrefix } from "../../utils/getKicadCompatibleComponentName"

/**
 * Creates TextEffects from metadata effects, falling back to defaults.
 */
function createTextEffects(metadataEffects?: KicadEffects): TextEffects {
  const font = new TextEffectsFont()
  if (metadataEffects?.font?.size) {
    font.size = {
      width: Number(metadataEffects.font.size.x),
      height: Number(metadataEffects.font.size.y),
    }
  } else {
    font.size = { width: 1.27, height: 1.27 }
  }
  if (metadataEffects?.font?.thickness !== undefined) {
    font.thickness = Number(metadataEffects.font.thickness)
  } else {
    font.thickness = 0.15
  }
  return new TextEffects({ font })
}

/**
 * Applies kicadFootprintMetadata to a Footprint object.
 */
function applyMetadataToFootprint(
  footprint: Footprint,
  metadata: KicadFootprintMetadata,
  componentName: string,
): void {
  // Apply properties if provided
  if (metadata.properties) {
    const newProperties: Property[] = []

    // Reference property - use value directly from metadata
    const refMeta = metadata.properties.Reference
    newProperties.push(
      new Property({
        key: "Reference",
        value: refMeta?.value ?? "REF**",
        position: refMeta?.at
          ? [
              Number(refMeta.at.x),
              Number(refMeta.at.y),
              Number(refMeta.at.rotation ?? 0),
            ]
          : [0, -3, 0],
        layer: refMeta?.layer ?? "F.SilkS",
        uuid: generateDeterministicUuid(`${componentName}-property-Reference`),
        effects: createTextEffects(refMeta?.effects),
        hidden: refMeta?.hide,
      }),
    )

    // Value property
    const valMeta = metadata.properties.Value
    newProperties.push(
      new Property({
        key: "Value",
        value: valMeta?.value ?? componentName,
        position: valMeta?.at
          ? [
              Number(valMeta.at.x),
              Number(valMeta.at.y),
              Number(valMeta.at.rotation ?? 0),
            ]
          : [0, 3, 0],
        layer: valMeta?.layer ?? "F.Fab",
        uuid: generateDeterministicUuid(`${componentName}-property-Value`),
        effects: createTextEffects(valMeta?.effects),
        hidden: valMeta?.hide,
      }),
    )

    // Datasheet property
    const dsMeta = metadata.properties.Datasheet
    newProperties.push(
      new Property({
        key: "Datasheet",
        value: dsMeta?.value ?? "",
        position: dsMeta?.at
          ? [
              Number(dsMeta.at.x),
              Number(dsMeta.at.y),
              Number(dsMeta.at.rotation ?? 0),
            ]
          : [0, 0, 0],
        layer: dsMeta?.layer ?? "F.Fab",
        uuid: generateDeterministicUuid(`${componentName}-property-Datasheet`),
        effects: createTextEffects(dsMeta?.effects),
        hidden: dsMeta?.hide ?? true,
      }),
    )

    // Description property
    const descMeta = metadata.properties.Description
    newProperties.push(
      new Property({
        key: "Description",
        value: descMeta?.value ?? "",
        position: descMeta?.at
          ? [
              Number(descMeta.at.x),
              Number(descMeta.at.y),
              Number(descMeta.at.rotation ?? 0),
            ]
          : [0, 0, 0],
        layer: descMeta?.layer ?? "F.Fab",
        uuid: generateDeterministicUuid(
          `${componentName}-property-Description`,
        ),
        effects: createTextEffects(descMeta?.effects),
        hidden: descMeta?.hide ?? true,
      }),
    )

    footprint.properties = newProperties
  }

  // Apply attributes if provided
  if (metadata.attributes) {
    // Create attr if it doesn't exist
    if (!footprint.attr) {
      footprint.attr = new FootprintAttr()
    }
    if (metadata.attributes.through_hole) {
      footprint.attr.type = "through_hole"
    } else if (metadata.attributes.smd) {
      footprint.attr.type = "smd"
    }
    if (metadata.attributes.exclude_from_pos_files !== undefined) {
      footprint.attr.excludeFromPosFiles =
        metadata.attributes.exclude_from_pos_files
    }
    if (metadata.attributes.exclude_from_bom !== undefined) {
      footprint.attr.excludeFromBom = metadata.attributes.exclude_from_bom
    }
  }

  // Apply footprintName if provided (modifies libraryLink)
  if (metadata.footprintName) {
    footprint.libraryLink = metadata.footprintName
  }

  // Apply layer if provided
  if (metadata.layer) {
    footprint.layer = metadata.layer
  }

  // Apply embeddedFonts if provided
  if (metadata.embeddedFonts !== undefined) {
    footprint.embeddedFonts = new EmbeddedFonts(metadata.embeddedFonts)
  }

  // Apply model if provided
  if (metadata.model) {
    const model = new FootprintModel(metadata.model.path)
    if (metadata.model.offset) {
      model.offset = {
        x: Number(metadata.model.offset.x),
        y: Number(metadata.model.offset.y),
        z: Number(metadata.model.offset.z),
      }
    }
    if (metadata.model.scale) {
      model.scale = {
        x: Number(metadata.model.scale.x),
        y: Number(metadata.model.scale.y),
        z: Number(metadata.model.scale.z),
      }
    }
    if (metadata.model.rotate) {
      model.rotate = {
        x: Number(metadata.model.rotate.x),
        y: Number(metadata.model.rotate.y),
        z: Number(metadata.model.rotate.z),
      }
    }
    // Add to models array (prepend to give priority over auto-generated models)
    const existingModels = footprint.models || []
    footprint.models = [model, ...existingModels]
  }
}

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

  private getCadComponentForPcbComponent(
    pcbComponentId: string,
  ): CadComponent | undefined {
    const cadComponents = this.ctx.db.cad_component?.list() || []
    return cadComponents.find(
      (cad: CadComponent) => cad.pcb_component_id === pcbComponentId,
    )
  }

  constructor(input: CircuitJson, ctx: ConverterContext) {
    super(input, ctx)
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

    const sourceComponent = component.source_component_id
      ? this.ctx.db.source_component.get(component.source_component_id)
      : null

    const cadComponent = this.getCadComponentForPcbComponent(
      component.pcb_component_id,
    )

    const footprintName = sourceComponent
      ? getKicadCompatibleComponentName(
          sourceComponent as SourceComponentBase,
          cadComponent,
        )
      : "Unknown"

    const transformedPos = applyToPoint(c2kMatPcb, {
      x: component.center.x,
      y: component.center.y,
    })

    const footprintData = `footprint:${component.pcb_component_id}:${transformedPos.x},${transformedPos.y}`
    const footprint = new Footprint({
      libraryLink: `tscircuit:${footprintName}`,
      layer: "F.Cu",
      at: [transformedPos.x, transformedPos.y, component.rotation || 0],
      uuid: generateDeterministicUuid(footprintData),
    })

    // Convert texts
    const fpTexts = footprint.fpTexts

    const pcbSilkscreenTexts =
      this.ctx.db.pcb_silkscreen_text
        ?.list()
        .filter(
          (text: any) => text.pcb_component_id === component.pcb_component_id,
        ) || []

    fpTexts.push(
      ...convertSilkscreenTexts(
        pcbSilkscreenTexts,
        component.center,
        component.rotation || 0,
        sourceComponent?.name,
      ),
    )

    const pcbNoteTexts =
      this.ctx.db.pcb_note_text
        ?.list()
        .filter(
          (text) => text.pcb_component_id === component.pcb_component_id,
        ) || []

    fpTexts.push(
      ...convertNoteTexts(
        pcbNoteTexts,
        component.center,
        component.rotation || 0,
      ),
    )

    footprint.fpTexts = fpTexts

    // Convert pads
    const fpPads = footprint.fpPads
    const getNetInfo = (pcbPortId?: string) =>
      this.getNetInfoForPcbPort(pcbPortId)

    const pcbPads =
      this.ctx.db.pcb_smtpad
        ?.list()
        .filter(
          (pad: any) => pad.pcb_component_id === component.pcb_component_id,
        ) || []

    const { pads: smdPads, nextPadNumber } = convertSmdPads(
      pcbPads,
      component.center,
      component.rotation || 0,
      component.pcb_component_id,
      1,
      getNetInfo,
    )
    fpPads.push(...smdPads)

    const pcbPlatedHoles =
      this.ctx.db.pcb_plated_hole
        ?.list()
        .filter(
          (hole: any) => hole.pcb_component_id === component.pcb_component_id,
        ) || []

    const { pads: thruHolePads } = convertPlatedHoles(
      pcbPlatedHoles,
      component.center,
      component.rotation || 0,
      component.pcb_component_id,
      nextPadNumber,
      getNetInfo,
    )
    fpPads.push(...thruHolePads)

    const pcbHoles =
      this.ctx.db.pcb_hole
        ?.list()
        .filter(
          (hole: any) => hole.subcircuit_id === component.subcircuit_id,
        ) || []

    const npthPads = convertNpthHoles(
      pcbHoles,
      component.center,
      component.rotation || 0,
    )
    fpPads.push(...npthPads)

    footprint.fpPads = fpPads

    // Convert circles
    const pcbSilkscreenCircles =
      this.ctx.db.pcb_silkscreen_circle
        ?.list()
        .filter(
          (circle: any) =>
            circle.pcb_component_id === component.pcb_component_id,
        ) || []

    const fpCircles = footprint.fpCircles ?? []
    fpCircles.push(
      ...convertSilkscreenCircles(pcbSilkscreenCircles, component.center),
    )

    const pcbCourtyardCircles =
      this.ctx.db.pcb_courtyard_circle
        ?.list()
        .filter(
          (circle) => circle.pcb_component_id === component.pcb_component_id,
        ) || []

    fpCircles.push(
      ...convertCourtyardCircles(pcbCourtyardCircles, component.center),
    )
    footprint.fpCircles = fpCircles

    // Convert rectangles
    const pcbFabRects =
      this.ctx.db.pcb_fabrication_note_rect
        ?.list()
        .filter(
          (rect: any) => rect.pcb_component_id === component.pcb_component_id,
        ) || []

    const fpRects = footprint.fpRects ?? []
    fpRects.push(...convertFabricationNoteRects(pcbFabRects, component.center))

    const pcbNoteRects =
      this.ctx.db.pcb_note_rect
        ?.list()
        .filter(
          (rect: any) => rect.pcb_component_id === component.pcb_component_id,
        ) || []

    fpRects.push(...convertNoteRects(pcbNoteRects, component.center))

    const pcbCourtyardRects =
      this.ctx.db.pcb_courtyard_rect
        ?.list()
        .filter(
          (rect: any) => rect.pcb_component_id === component.pcb_component_id,
        ) || []

    fpRects.push(...convertCourtyardRects(pcbCourtyardRects, component.center))
    footprint.fpRects = fpRects

    // Convert polygons
    const pcbCourtyardOutlines =
      this.ctx.db.pcb_courtyard_outline
        ?.list()
        .filter(
          (outline: any) =>
            outline.pcb_component_id === component.pcb_component_id,
        ) || []

    const fpPolys = convertCourtyardOutlines(
      pcbCourtyardOutlines,
      component.center,
    )

    if (fpPolys.length > 0) {
      footprint.fpPolys = fpPolys
    }

    // Add 3D models
    if (cadComponent) {
      const models = create3DModelsFromCadComponent(
        cadComponent,
        component.center,
      )
      if (models.length > 0) {
        footprint.models = models
      }
    }

    // Apply kicadFootprintMetadata if available
    if (this.ctx.footprintMetadataMap && sourceComponent?.name) {
      const refDesPrefix = extractReferencePrefix(sourceComponent.name)
      const metadata = this.ctx.footprintMetadataMap.get(refDesPrefix)
      if (metadata) {
        applyMetadataToFootprint(footprint, metadata, sourceComponent.name)
      }
    }

    const footprints = kicadPcb.footprints
    footprints.push(footprint)
    kicadPcb.footprints = footprints

    this.componentsProcessed++
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
