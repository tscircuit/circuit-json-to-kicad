import type { CircuitJson } from "circuit-json"
import type { KicadSch } from "kicadts"
import { Paper, Uuid } from "kicadts"
import { ConverterStage } from "../../types"

/**
 * Initializes the basic KicadSch structure with version, paper size, UUID, etc.
 */
export class InitializeSchematicStage extends ConverterStage<
  CircuitJson,
  KicadSch
> {
  override _step(): void {
    const { kicadSch, schematicPaperSize } = this.ctx

    if (!kicadSch) {
      throw new Error("KicadSch instance not initialized in context")
    }

    // Set the version to the latest KiCad format
    kicadSch.version = 20250114

    // Set paper size from context (dynamically selected based on content)
    const paper = new Paper()
    paper.size = schematicPaperSize?.name ?? "A4"
    kicadSch.paper = paper

    // Generate a UUID for this schematic
    kicadSch.uuid = new Uuid(crypto.randomUUID())

    this.finished = true
  }

  override getOutput(): KicadSch {
    return this.ctx.kicadSch!
  }
}
