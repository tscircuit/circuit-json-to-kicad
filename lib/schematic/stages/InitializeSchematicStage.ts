import type { CircuitJson } from "circuit-json"
import type { KicadSch } from "kicadts"
import { Paper, Uuid } from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"

/**
 * Initializes the basic KicadSch structure with version, paper size, UUID, etc.
 */
export class InitializeSchematicStage extends ConverterStage<
  CircuitJson,
  KicadSch
> {
  _step(): void {
    const { kicadSch } = this.ctx

    // Set the version to the latest KiCad format
    kicadSch.version = 20250114

    // Set paper size to A4 (standard)
    const paper = new Paper()
    paper.size = "A4"
    kicadSch.paper = paper

    // Generate a UUID for this schematic
    kicadSch.uuid = new Uuid(crypto.randomUUID())

    this.finished = true
  }

  getOutput(): KicadSch {
    return this.ctx.kicadSch
  }
}
