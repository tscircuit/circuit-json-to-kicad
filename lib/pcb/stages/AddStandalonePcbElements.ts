import type { CircuitJson, PcbHole } from "circuit-json"
import type { KicadPcb } from "kicadts"
import { Footprint } from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"
import { applyToPoint } from "transformation-matrix"
import { generateDeterministicUuid } from "./utils/generateDeterministicUuid"
import { convertNpthHoles } from "./footprints-stage-converters/convertNpthHoles"

/**
 * Adds standalone holes (pcb_hole with pcb_component_id: null) to the PCB.
 * Each hole is added as a standalone footprint.
 */
export class AddStandalonePcbElements extends ConverterStage<
  CircuitJson,
  KicadPcb
> {
  private holesProcessed = 0
  private standaloneHoles: PcbHole[] = []

  constructor(input: CircuitJson, ctx: ConverterContext) {
    super(input, ctx)
    this.standaloneHoles = (this.ctx.db.pcb_hole.list() as PcbHole[]).filter(
      (hole) => !hole.pcb_component_id,
    )
  }

  override _step(): void {
    const { kicadPcb, c2kMatPcb } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    if (!c2kMatPcb) {
      throw new Error("PCB transformation matrix not initialized in context")
    }

    if (this.holesProcessed >= this.standaloneHoles.length) {
      this.finished = true
      return
    }

    const hole = this.standaloneHoles[this.holesProcessed] as PcbHole
    if (!hole) {
      this.holesProcessed++
      return
    }

    const kicadPos = applyToPoint(c2kMatPcb, {
      x: hole.x,
      y: hole.y,
    })

    const footprintSeed = `standalone_hole:${hole.pcb_hole_id}:${kicadPos.x},${kicadPos.y}`
    const footprint = new Footprint({
      libraryLink: "tscircuit:MountingHole",
      layer: "F.Cu",
      at: [kicadPos.x, kicadPos.y, 0],
      uuid: generateDeterministicUuid(footprintSeed),
    })

    const ccwRotationDegrees = 0
    const npthPads = convertNpthHoles(
      [hole],
      { x: hole.x, y: hole.y },
      ccwRotationDegrees,
    )

    if (npthPads.length > 0) {
      footprint.fpPads = npthPads
      const footprints = kicadPcb.footprints
      footprints.push(footprint)
      kicadPcb.footprints = footprints
    }

    this.holesProcessed++
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
