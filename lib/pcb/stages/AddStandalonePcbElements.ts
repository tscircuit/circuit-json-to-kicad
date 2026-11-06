import type {
  CircuitJson,
  PcbHole,
  PcbHoleCircularWithRectPad,
  PcbHolePillWithRectPad,
  PcbHoleRotatedPillWithRectPad,
  PcbPlatedHole,
  PcbPlatedHoleOval,
  PcbSmtPad,
  PcbSolderPaste,
} from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Footprint } from "kicadts"
import { applyToPoint } from "transformation-matrix"
import { type ConverterContext, ConverterStage } from "../../types"
import { convertNpthHoles } from "./footprints-stage-converters/convertNpthHoles"
import { applyInferredFootprintType } from "./utils/applyInferredFootprintType"
import { createSmdPadFromCircuitJson } from "./utils/CreateSmdPadFromCircuitJson"
import {
  createSolderPastePadFromCircuitJson,
  getSolderPasteCenter,
} from "./utils/CreateSolderPastePadFromCircuitJson"
import { createThruHolePadFromCircuitJson } from "./utils/CreateThruHolePadFromCircuitJson"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"
import { getSolderPasteLibraryLink } from "./utils/getSolderPasteLibraryLink"

const getFinitePositiveDimension = (
  value: unknown,
  fallback: number,
): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback

const getFiniteNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback

export class AddStandalonePcbElements extends ConverterStage<
  CircuitJson,
  KicadPcb
> {
  private unprocessedElements: Array<
    PcbHole | PcbPlatedHole | PcbSmtPad | PcbSolderPaste
  > = []

  constructor(input: CircuitJson, ctx: ConverterContext) {
    super(input, ctx)
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
      ...(this.ctx.db.pcb_solder_paste.list() as PcbSolderPaste[]).filter(
        (paste) => !paste.pcb_component_id && !paste.pcb_smtpad_id,
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

      const linkedSolderPaste = (
        this.ctx.db.pcb_solder_paste.list() as PcbSolderPaste[]
      ).filter((paste) => paste.pcb_smtpad_id === pcbPad.pcb_smtpad_id)

      footprint.fpPads = [
        createSmdPadFromCircuitJson({
          pcbPad,
          componentCenter: padCenter,
          padNumber: 1,
          componentRotation: 0,
          componentId: pcbPad.pcb_smtpad_id,
        }),
        ...linkedSolderPaste.map((solderPaste) =>
          createSolderPastePadFromCircuitJson({
            solderPaste,
            componentCenter: padCenter,
          }),
        ),
      ]
      applyInferredFootprintType(footprint)
      const footprints = kicadPcb.footprints
      footprints.push(footprint)
      kicadPcb.footprints = footprints
    } else if (elm.type === "pcb_solder_paste") {
      const center = getSolderPasteCenter(elm)
      const footprintSeed = `standalone_solder_paste:${elm.pcb_solder_paste_id}`
      const kicadPos = applyToPoint(c2kMatPcb, center)
      const footprint = new Footprint({
        libraryLink: getSolderPasteLibraryLink(elm),
        layer: elm.layer === "bottom" ? "B.Cu" : "F.Cu",
        at: [kicadPos.x, kicadPos.y, 0],
        uuid: generateDeterministicUuid(footprintSeed),
      })

      footprint.fpPads = [
        createSolderPastePadFromCircuitJson({
          solderPaste: elm,
          componentCenter: center,
        }),
      ]
      applyInferredFootprintType(footprint)
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
        applyInferredFootprintType(footprint)
        const footprints = kicadPcb.footprints
        footprints.push(footprint)
        kicadPcb.footprints = footprints
      }
    }
  }

  private getHoleLibraryLink(hole: PcbHole): string {
    const { hole_shape: shape } = hole
    if (shape === "circle") {
      const holeDiameter = getFinitePositiveDimension(hole.hole_diameter, 1.0)
      return `tscircuit:hole_${shape}_holeDiameter${holeDiameter}mm`
    }
    if (shape === "pill" || shape === "oval") {
      const h = hole
      const holeWidth = getFinitePositiveDimension(h.hole_width, 1.0)
      const holeHeight = getFinitePositiveDimension(h.hole_height, 1.0)
      return `tscircuit:hole_${shape}_holeWidth${holeWidth}mm_holeHeight${holeHeight}mm`
    }
    if (shape === "rotated_pill") {
      const holeWidth = getFinitePositiveDimension(hole.hole_width, 1.0)
      const holeHeight = getFinitePositiveDimension(hole.hole_height, 1.0)
      const ccwRotation = getFiniteNumber(hole.ccw_rotation, 0)
      return `tscircuit:hole_${shape}_holeWidth${holeWidth}mm_holeHeight${holeHeight}mm_ccwRotation${ccwRotation}deg`
    }
    return "tscircuit:hole"
  }

  private getPlatedHoleLibraryLink(hole: PcbPlatedHole): string {
    const shape = hole.shape
    if (shape === "circle") {
      const holeDiameter = getFinitePositiveDimension(hole.hole_diameter, 0.8)
      const outerDiameter = getFinitePositiveDimension(
        hole.outer_diameter,
        Math.max(1.6, holeDiameter),
      )
      return `tscircuit:platedhole_${shape}_holeDiameter${holeDiameter}mm_outerDiameter${outerDiameter}mm`
    }
    if (shape === "pill" || shape === "oval") {
      const h = hole as PcbPlatedHoleOval
      const holeWidth = getFinitePositiveDimension(h.hole_width, 0.8)
      const holeHeight = getFinitePositiveDimension(h.hole_height, 0.8)
      const outerWidth = getFinitePositiveDimension(
        h.outer_width,
        Math.max(1.6, holeWidth),
      )
      const outerHeight = getFinitePositiveDimension(
        h.outer_height,
        Math.max(1.6, holeHeight),
      )
      return `tscircuit:platedhole_${shape}_holeWidth${holeWidth}mm_holeHeight${holeHeight}mm_outerWidth${outerWidth}mm_outerHeight${outerHeight}mm`
    }
    if (shape === "pill_hole_with_rect_pad") {
      const h = hole as PcbHolePillWithRectPad
      const holeWidth = getFinitePositiveDimension(h.hole_width, 0.8)
      const holeHeight = getFinitePositiveDimension(h.hole_height, 0.8)
      const rectPadWidth = getFinitePositiveDimension(
        h.rect_pad_width,
        Math.max(1.6, holeWidth),
      )
      const rectPadHeight = getFinitePositiveDimension(
        h.rect_pad_height,
        Math.max(1.6, holeHeight),
      )
      return `tscircuit:platedhole_${shape}_holeWidth${holeWidth}mm_holeHeight${holeHeight}mm_rectPadWidth${rectPadWidth}mm_rectPadHeight${rectPadHeight}mm`
    }
    if (shape === "circular_hole_with_rect_pad") {
      const h = hole as PcbHoleCircularWithRectPad & {
        rect_ccw_rotation?: number
      }
      const holeDiameter = getFinitePositiveDimension(h.hole_diameter, 0.8)
      const rectPadWidth = getFinitePositiveDimension(
        h.rect_pad_width,
        Math.max(1.6, holeDiameter),
      )
      const rectPadHeight = getFinitePositiveDimension(
        h.rect_pad_height,
        Math.max(1.6, holeDiameter),
      )
      let link = `tscircuit:platedhole_${shape}_holeDiameter${holeDiameter}mm_rectPadWidth${rectPadWidth}mm_rectPadHeight${rectPadHeight}mm`
      const ccwRotation = getFiniteNumber(h.rect_ccw_rotation, 0)
      if (ccwRotation) {
        link += `_ccwRotation${ccwRotation}deg`
      }
      return link
    }
    if (shape === "rotated_pill_hole_with_rect_pad") {
      const h = hole as PcbHoleRotatedPillWithRectPad
      const holeWidth = getFinitePositiveDimension(h.hole_width, 0.8)
      const holeHeight = getFinitePositiveDimension(h.hole_height, 0.8)
      const rectPadWidth = getFinitePositiveDimension(
        h.rect_pad_width,
        Math.max(1.6, holeWidth),
      )
      const rectPadHeight = getFinitePositiveDimension(
        h.rect_pad_height,
        Math.max(1.6, holeHeight),
      )
      let link = `tscircuit:platedhole_${shape}_holeWidth${holeWidth}mm_holeHeight${holeHeight}mm_rectPadWidth${rectPadWidth}mm_rectPadHeight${rectPadHeight}mm`
      const ccwRotation = getFiniteNumber(h.rect_ccw_rotation, 0)
      if (ccwRotation) {
        link += `_ccwRotation${ccwRotation}deg`
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
      const radius = getFinitePositiveDimension(pcbPad.radius, 0.5)
      return `tscircuit:smtpad_circle_diameter${radius * 2}mm`
    }
    if (
      (pcbPad.shape === "rect" || pcbPad.shape === "rotated_rect") &&
      "width" in pcbPad &&
      "height" in pcbPad
    ) {
      const width = getFinitePositiveDimension(pcbPad.width, 1.0)
      const height = getFinitePositiveDimension(pcbPad.height, 1.0)
      return `tscircuit:smtpad_${pcbPad.shape}_width${width}mm_height${height}mm`
    }
    return "tscircuit:smtpad"
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
