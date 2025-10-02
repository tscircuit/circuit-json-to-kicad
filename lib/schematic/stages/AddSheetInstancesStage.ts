import type { CircuitJson } from "circuit-json"
import type { KicadSch } from "kicadts"
import {
  SheetInstances,
  SheetInstancesRootPath,
  SheetInstancesRootPage,
  EmbeddedFonts,
} from "kicadts"
import { ConverterStage, type ConverterContext } from "../../types"

/**
 * Adds sheet_instances section with root path and page metadata
 */
export class AddSheetInstancesStage extends ConverterStage<
  CircuitJson,
  KicadSch
> {
  override _step(): void {
    const { kicadSch } = this.ctx

    if (!kicadSch) {
      throw new Error("KicadSch instance not initialized in context")
    }

    // Create sheet_instances section using SheetInstances
    const sheetInstances = new SheetInstances()

    // Add root path
    const path = new SheetInstancesRootPath()
    path.value = "/"

    const page = new SheetInstancesRootPage("1")

    // Set pages array directly instead of pushing
    path.pages = [page]

    sheetInstances.paths = [path]
    kicadSch.sheetInstances = sheetInstances

    // Set embedded_fonts to no
    kicadSch.embeddedFonts = new EmbeddedFonts(false)

    this.finished = true
  }

  override getOutput(): KicadSch {
    return this.ctx.kicadSch!
  }
}
