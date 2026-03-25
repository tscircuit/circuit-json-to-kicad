import type { CircuitJson, PcbHole, PcbPlatedHole } from "circuit-json"
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
  private holesProcessed = 0
  private platedHolesProcessed = 0
  private standaloneHoles: PcbHole[] = []
  private standalonePlatedHoles: PcbPlatedHole[] = []

  constructor(input: CircuitJson, ctx: ConverterContext) {
    super(input, ctx)
    this.standaloneHoles = (this.ctx.db.pcb_hole.list() as PcbHole[]).filter(
      (hole) => !hole.pcb_component_id,
    )
    this.standalonePlatedHoles = (
      this.ctx.db.pcb_plated_hole.list() as PcbPlatedHole[]
    ).filter((hole) => !hole.pcb_component_id)
  }

  override _step(): void {
    const { kicadPcb, c2kMatPcb } = this.ctx

    if (!kicadPcb) {
      throw new Error("KicadPcb instance not initialized in context")
    }

    if (!c2kMatPcb) {
      throw new Error("PCB transformation matrix not initialized in context")
    }

    if (this.holesProcessed < this.standaloneHoles.length) {
      const hole = this.standaloneHoles[this.holesProcessed] as PcbHole
      if (hole) {
        const boardOrigin = applyToPoint(c2kMatPcb, { x: 0, y: 0 })

        const footprintSeed = `standalone_hole:${hole.pcb_hole_id}:${hole.x},${hole.y}`
        const footprint = new Footprint({
          libraryLink: "tscircuit:MountingHole",
          layer: "F.Cu",
          at: [boardOrigin.x, boardOrigin.y, 0],
          uuid: generateDeterministicUuid(footprintSeed),
        })

        const ccwRotationDegrees = 0
        const npthPads = convertNpthHoles(
          [hole],
          { x: 0, y: 0 }, // Relative to board origin
          ccwRotationDegrees,
        )

        if (npthPads.length > 0) {
          footprint.fpPads = npthPads
          const footprints = kicadPcb.footprints
          footprints.push(footprint)
          kicadPcb.footprints = footprints
        }
      }
      this.holesProcessed++
      return
    }

    if (this.platedHolesProcessed < this.standalonePlatedHoles.length) {
      const hole = this.standalonePlatedHoles[
        this.platedHolesProcessed
      ] as PcbPlatedHole
      if (hole) {
        const boardOrigin = applyToPoint(c2kMatPcb, { x: 0, y: 0 })

        const footprintSeed = `standalone_plated_hole:${hole.pcb_plated_hole_id}:${hole.x},${hole.y}`
        const footprint = new Footprint({
          libraryLink: "tscircuit:MountingHole_Pad",
          layer: "F.Cu",
          at: [boardOrigin.x, boardOrigin.y, 0],
          uuid: generateDeterministicUuid(footprintSeed),
        })

        const pad = createThruHolePadFromCircuitJson({
          platedHole: hole,
          componentCenter: { x: 0, y: 0 },
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
      this.platedHolesProcessed++
      return
    }

    this.finished = true
  }

  override getOutput(): KicadPcb {
    return this.ctx.kicadPcb!
  }
}
