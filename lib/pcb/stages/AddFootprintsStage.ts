import type {
  CircuitJson,
  CadComponent,
  SourceComponentBase,
} from "circuit-json"
import { getKicadCompatibleComponentName } from "../../utils/getKicadCompatibleComponentName"
import type { KicadPcb } from "kicadts"
import { Footprint, FootprintModel, FpText } from "kicadts"
import {
  MODEL_CDN_BASE_URL,
  getBasename,
} from "../../kicad-library/stages/ExtractFootprintsStage"
import {
  ConverterStage,
  type ConverterContext,
  type PcbNetInfo,
} from "../../types"
import { applyToPoint } from "transformation-matrix"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"
import { applyMetadataToFootprint } from "./utils/applyMetadataToFootprint"
import type { KicadFootprintMetadata } from "@tscircuit/props"
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

/**
 * Adds footprints to the PCB from circuit JSON components
 */
export class AddFootprintsStage extends ConverterStage<CircuitJson, KicadPcb> {
  private componentsProcessed = 0
  private pcbComponents: any[] = []
  private includeBuiltin3dModels: boolean

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

  constructor(
    input: CircuitJson,
    ctx: ConverterContext,
    options?: { includeBuiltin3dModels?: boolean },
  ) {
    super(input, ctx)
    this.pcbComponents = this.ctx.db.pcb_component.list()
    this.includeBuiltin3dModels = options?.includeBuiltin3dModels ?? false
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

    // Ensure fp_text reference exists — inline <footprint> components may not
    // have a silkscreen text matching the component name
    if (sourceComponent?.name && !fpTexts.some((t) => t.type === "reference")) {
      fpTexts.push(
        new FpText({
          type: "reference",
          text: sourceComponent.name,
          position: { x: 0, y: -1, angle: 0 },
          layer: "F.SilkS",
        }),
      )
    }

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
      // circuit-json position.z is relative to PCB midplane (PCB center = z=0),
      // but KiCad model offsets are relative to the PCB surface.
      // Subtract boardThickness/2 (or -boardThickness/2 for bottom) to correct.
      const pcbBoard = this.ctx.db.pcb_board?.list()[0]
      const boardThickness = pcbBoard?.thickness ?? 0
      const boardLayerZOffset =
        component.layer === "bottom"
          ? -(boardThickness / 2)
          : boardThickness / 2
      const models = create3DModelsFromCadComponent(
        cadComponent,
        component.center,
        { boardLayerZOffset },
      )
      const KICAD_3D_BASE = "${KIPRJMOD}/3dmodels"
      if (models.length > 0) {
        if (this.includeBuiltin3dModels) {
          // Rewrite user model paths to ${KIPRJMOD}/... and track source URLs
          footprint.models = models.map((model) => {
            if (!model.path) return model
            const filename = getBasename(model.path)
            const isRemote =
              model.path.startsWith("http://modelcdn.tscircuit.com") ||
              model.path.startsWith("https://modelcdn.tscircuit.com")
            const folderName = isRemote
              ? "tscircuit_builtin"
              : (this.ctx.projectName ?? filename.replace(/\.[^.]+$/, ""))
            const newModel = new FootprintModel(
              `${KICAD_3D_BASE}/${folderName}.3dshapes/${filename}`,
            )
            if (model.offset) newModel.offset = model.offset
            if (model.scale) newModel.scale = model.scale
            if (model.rotate) newModel.rotate = model.rotate
            // Track original source URL for the CLI to download (strip query params)
            const sourcePath = model.path?.split("?")[0]
            if (
              sourcePath &&
              !this.ctx.pcbModel3dSourcePaths?.includes(sourcePath)
            ) {
              this.ctx.pcbModel3dSourcePaths?.push(sourcePath)
            }
            return newModel
          })
        } else {
          // Keep original paths (e.g. for kicad-library extraction flow)
          footprint.models = models
        }
      } else if (
        cadComponent.footprinter_string &&
        this.includeBuiltin3dModels
      ) {
        // Builtin CDN fallback: only when includeBuiltin3dModels is enabled
        const { footprinter_string } = cadComponent
        const modelPath = `${KICAD_3D_BASE}/tscircuit_builtin.3dshapes/${footprinter_string}.step`
        footprint.models = [new FootprintModel(modelPath)]
        // Record CDN source URL so callers can download and include the model file
        const cdnUrl = `${MODEL_CDN_BASE_URL}/${footprinter_string}.step`
        if (!this.ctx.pcbModel3dSourcePaths?.includes(cdnUrl)) {
          this.ctx.pcbModel3dSourcePaths?.push(cdnUrl)
        }
      }
    }

    // Apply kicadFootprintMetadata from circuit-json element
    const footprintMetadata = component.metadata?.kicad_footprint as
      | KicadFootprintMetadata
      | undefined
    if (footprintMetadata && sourceComponent?.name) {
      applyMetadataToFootprint(
        footprint,
        footprintMetadata,
        sourceComponent.name,
      )
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
