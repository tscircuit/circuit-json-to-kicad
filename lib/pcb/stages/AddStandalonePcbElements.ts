import type {
  CircuitJson,
  PcbHole,
  PcbHoleCircularWithRectPad,
  PcbHolePillWithRectPad,
  PcbHoleRotatedPillWithRectPad,
  PcbPlatedHole,
  PcbPlatedHoleOval,
  PcbSmtPad,
} from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Footprint, FootprintAttr } from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { type ConverterContext, ConverterStage } from "../../types"
import { convertNpthHoles } from "./footprints-stage-converters/convertNpthHoles"
import { applyMetadataToFootprint } from "./utils/applyMetadataToFootprint"
import { createSmdPadFromCircuitJson } from "./utils/CreateSmdPadFromCircuitJson"
import { createThruHolePadFromCircuitJson } from "./utils/CreateThruHolePadFromCircuitJson"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"

export class AddStandalonePcbElements extends ConverterStage<
  CircuitJson,
  KicadPcb
> {
  private unprocessedElements: Array<PcbHole | PcbPlatedHole | PcbSmtPad> = []
  private takenReferences = new Set<string>()
  private referenceCounts = new Map<string, number>()

  constructor(input: CircuitJson, ctx: ConverterContext) {
    super(input, ctx)
    for (const sourceComponent of this.ctx.db.source_component?.list() ?? []) {
      if (sourceComponent.name) this.takenReferences.add(sourceComponent.name)
    }
    this.unprocessedElements = [
      ...(this.ctx.db.pcb_hole.list() as PcbHole[]).filter(
        (hole) => !hole.pcb_component_id,
      ),
      ...(this.ctx.db.pcb_plated_hole.list() as PcbPlatedHole[]).filter(
        (hole) => !hole.pcb_component_id,
      ),
      ...(this.ctx.db.pcb_smtpad.list() as PcbSmtPad[]).filter(
        (pad) => !pad.pcb_component_id,
      ),
    ]
  }

  /**
   * Standalone elements have no source component to take a reference
   * designator from, so hand out the next free one for the prefix, skipping
   * anything a real component already claims.
   */
  private takeReference(prefix: string): string {
    let count = this.referenceCounts.get(prefix) ?? 0
    let reference: string
    do {
      count++
      reference = `${prefix}${count}`
    } while (this.takenReferences.has(reference))
    this.referenceCounts.set(prefix, count)
    this.takenReferences.add(reference)
    return reference
  }

  /**
   * KiCad rejects a footprint with no reference designator when exporting a
   * Specctra DSN (what the freerouting plugin runs on), so every footprint
   * needs the same property block a component footprint gets. The value is
   * the footprint name, matching KiCad's own MountingHole footprints.
   */
  private applyStandaloneFootprintMetadata(
    footprint: Footprint,
    prefix: string,
  ) {
    applyMetadataToFootprint({
      footprint,
      metadata: undefined,
      componentProperty: {
        reference: this.takeReference(prefix),
        kicadComponentValue: footprint.libraryLink?.replace(/^tscircuit:/, ""),
      },
    })

    // Nothing here comes from a source component, so there is nothing to buy
    // and nothing for a machine to place. KiCad's own MountingHole footprints
    // carry the same pair.
    const attr = footprint.attr ?? new FootprintAttr()
    attr.excludeFromPosFiles = true
    attr.excludeFromBom = true
    footprint.attr = attr
  }

  override _step(): void {
    const { kicadPcb, c2kMatPcb } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    if (!c2kMatPcb) {
      throw new Error("PCB transformation matrix not initialized in context")
    }

    const elm = this.unprocessedElements.shift()
    if (!elm) {
      this.finished = true
      return
    }

    if (elm.type === "pcb_smtpad") {
      const pcbPad = elm
      const padCenter = this.getPcbSmtPadCenter(pcbPad)
      const footprintSeed = `standalone_smtpad:${pcbPad.pcb_smtpad_id}:${padCenter.x},${padCenter.y}`
      const kicadPos = applyToPoint(c2kMatPcb, padCenter)

      const footprint = new Footprint({
        libraryLink: this.getSmtPadLibraryLink(pcbPad),
        layer: "F.Cu",
        at: [kicadPos.x, kicadPos.y, 0],
        uuid: generateDeterministicUuid(footprintSeed),
      })

      footprint.fpPads = [
        createSmdPadFromCircuitJson({
          pcbPad,
          componentCenter: padCenter,
          padNumber: 1,
          componentRotation: 0,
          componentId: pcbPad.pcb_smtpad_id,
        }),
      ]
      this.applyStandaloneFootprintMetadata(footprint, "PAD")
      const footprints = kicadPcb.footprints
      footprints.push(footprint)
      kicadPcb.footprints = footprints
    } else if (elm.type === "pcb_hole") {
      const hole = elm
      const footprintSeed = `standalone_hole:${hole.pcb_hole_id}:${hole.x},${hole.y}`
      const kicadPos = applyToPoint(c2kMatPcb, { x: hole.x, y: hole.y })
      const libraryLink = this.getHoleLibraryLink(hole)

      const footprint = new Footprint({
        libraryLink,
        layer: "F.Cu",
        at: [kicadPos.x, kicadPos.y, 0],
        uuid: generateDeterministicUuid(footprintSeed),
      })

      const ccwRotationDegrees = 0
      const npthPads = convertNpthHoles({
        pcbHoles: [hole],
        componentCenter: { x: hole.x, y: hole.y }, // Use hole center for negative offset
        componentRotation: ccwRotationDegrees,
      })

      if (npthPads.length > 0) {
        footprint.fpPads = npthPads
        this.applyStandaloneFootprintMetadata(footprint, "H")
        const footprints = kicadPcb.footprints
        footprints.push(footprint)
        kicadPcb.footprints = footprints
      }
    } else if (elm.type === "pcb_plated_hole") {
      const hole = elm
      const footprintSeed = `standalone_plated_hole:${hole.pcb_plated_hole_id}:${hole.x},${hole.y}`
      const kicadPos = applyToPoint(c2kMatPcb, { x: hole.x, y: hole.y })
      const libraryLink = this.getPlatedHoleLibraryLink(hole)

      const footprint = new Footprint({
        libraryLink,
        layer: "F.Cu",
        at: [kicadPos.x, kicadPos.y, 0],
        uuid: generateDeterministicUuid(footprintSeed),
      })

      const pad = createThruHolePadFromCircuitJson({
        platedHole: hole,
        componentCenter: { x: hole.x, y: hole.y },
        padNumber: 1,
        componentRotation: 0,
      })

      if (pad) {
        footprint.fpPads = [pad]
        this.applyStandaloneFootprintMetadata(footprint, "H")
        const footprints = kicadPcb.footprints
        footprints.push(footprint)
        kicadPcb.footprints = footprints
      }
    }
  }

  private getHoleLibraryLink(hole: PcbHole): string {
    const { hole_shape: shape } = hole
    if (shape === "circle") {
      return `tscircuit:hole_${shape}_holeDiameter${hole.hole_diameter}mm`
    }
    if (shape === "pill" || shape === "oval") {
      const h = hole
      return `tscircuit:hole_${shape}_holeWidth${h.hole_width}mm_holeHeight${h.hole_height}mm`
    }
    if (shape === "rotated_pill") {
      return `tscircuit:hole_${shape}_holeWidth${hole.hole_width}mm_holeHeight${hole.hole_height}mm_ccwRotation${hole.ccw_rotation}deg`
    }
    return "tscircuit:hole"
  }

  private getPlatedHoleLibraryLink(hole: PcbPlatedHole): string {
    const shape = hole.shape
    if (shape === "circle") {
      return `tscircuit:platedhole_${shape}_holeDiameter${hole.hole_diameter}mm_outerDiameter${hole.outer_diameter}mm`
    }
    if (shape === "pill" || shape === "oval") {
      const h = hole as PcbPlatedHoleOval
      return `tscircuit:platedhole_${shape}_holeWidth${h.hole_width}mm_holeHeight${h.hole_height}mm_outerWidth${h.outer_width}mm_outerHeight${h.outer_height}mm`
    }
    if (shape === "pill_hole_with_rect_pad") {
      const h = hole as PcbHolePillWithRectPad
      return `tscircuit:platedhole_${shape}_holeWidth${h.hole_width}mm_holeHeight${h.hole_height}mm_rectPadWidth${h.rect_pad_width}mm_rectPadHeight${h.rect_pad_height}mm`
    }
    if (shape === "circular_hole_with_rect_pad") {
      const h = hole as PcbHoleCircularWithRectPad & {
        rect_ccw_rotation?: number
      }
      let link = `tscircuit:platedhole_${shape}_holeDiameter${h.hole_diameter}mm_rectPadWidth${h.rect_pad_width}mm_rectPadHeight${h.rect_pad_height}mm`
      if (h.rect_ccw_rotation) {
        link += `_ccwRotation${h.rect_ccw_rotation}deg`
      }
      return link
    }
    if (shape === "rotated_pill_hole_with_rect_pad") {
      const h = hole as PcbHoleRotatedPillWithRectPad
      let link = `tscircuit:platedhole_${shape}_holeWidth${h.hole_width}mm_holeHeight${h.hole_height}mm_rectPadWidth${h.rect_pad_width}mm_rectPadHeight${h.rect_pad_height}mm`
      if (h.rect_ccw_rotation) {
        link += `_ccwRotation${h.rect_ccw_rotation}deg`
      }
      return link
    }
    return "tscircuit:platedhole"
  }

  private getPcbSmtPadCenter(pcbPad: PcbSmtPad): { x: number; y: number } {
    if ("x" in pcbPad && "y" in pcbPad) {
      return { x: pcbPad.x, y: pcbPad.y }
    }

    const points = pcbPad.points as Array<{ x: number; y: number }>
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    }
  }

  private getSmtPadLibraryLink(pcbPad: PcbSmtPad): string {
    if (pcbPad.shape === "circle" && "radius" in pcbPad) {
      return `tscircuit:smtpad_circle_diameter${pcbPad.radius * 2}mm`
    }
    if (
      (pcbPad.shape === "rect" || pcbPad.shape === "rotated_rect") &&
      "width" in pcbPad &&
      "height" in pcbPad
    ) {
      return `tscircuit:smtpad_${pcbPad.shape}_width${pcbPad.width}mm_height${pcbPad.height}mm`
    }
    return "tscircuit:smtpad"
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
