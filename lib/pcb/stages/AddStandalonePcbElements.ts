import type {
  CircuitJson,
  PcbHole,
  PcbPlatedHole,
  PcbPlatedHoleOval,
  PcbHolePillWithRectPad,
  PcbHoleCircularWithRectPad,
} from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Footprint } from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"
import { applyToPoint } from "transformation-matrix"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"
import { convertNpthHoles } from "./footprints-stage-converters/convertNpthHoles"
import { createThruHolePadFromCircuitJson } from "./utils/CreateThruHolePadFromCircuitJson"

export class AddStandalonePcbElements extends ConverterStage<
  CircuitJson,
  KicadPcb
> {
  private unprocessedElements: Array<PcbHole | PcbPlatedHole> = []

  constructor(input: CircuitJson, ctx: ConverterContext) {
    super(input, ctx)
    this.unprocessedElements = [
      ...(this.ctx.db.pcb_hole.list() as PcbHole[]).filter(
        (hole) => !hole.pcb_component_id,
      ),
      ...(this.ctx.db.pcb_plated_hole.list() as PcbPlatedHole[]).filter(
        (hole) => !hole.pcb_component_id,
      ),
    ]
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

    const boardOrigin = applyToPoint(c2kMatPcb, { x: 0, y: 0 })

    if (elm.type === "pcb_hole") {
      const hole = elm
      const footprintSeed = `standalone_hole:${hole.pcb_hole_id}:${hole.x},${hole.y}`
      const holeCenter = applyToPoint(c2kMatPcb, { x: hole.x, y: hole.y })
      const libraryLink = this.getHoleLibraryLink(hole)

      const footprint = new Footprint({
        libraryLink,
        layer: "F.Cu",
        at: [holeCenter.x, holeCenter.y, 0],
        uuid: generateDeterministicUuid(footprintSeed),
      })

      const ccwRotationDegrees = 0
      const npthPads = convertNpthHoles(
        [hole],
        { x: hole.x, y: hole.y }, // Use hole center for negative offset
        ccwRotationDegrees,
      )

      if (npthPads.length > 0) {
        footprint.fpPads = npthPads
        const footprints = kicadPcb.footprints
        footprints.push(footprint)
        kicadPcb.footprints = footprints
      }
    } else if (elm.type === "pcb_plated_hole") {
      const hole = elm
      const footprintSeed = `standalone_plated_hole:${hole.pcb_plated_hole_id}:${hole.x},${hole.y}`
      const platedHoleCenter = applyToPoint(c2kMatPcb, { x: hole.x, y: hole.y })
      const libraryLink = this.getPlatedHoleLibraryLink(hole)

      const footprint = new Footprint({
        libraryLink,
        layer: "F.Cu",
        at: [platedHoleCenter.x, platedHoleCenter.y, 0],
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
      const h = hole as PcbHoleCircularWithRectPad
      return `tscircuit:platedhole_${shape}_holeDiameter${h.hole_diameter}mm_rectPadWidth${h.rect_pad_width}mm_rectPadHeight${h.rect_pad_height}mm`
    }
    return "tscircuit:platedhole"
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
