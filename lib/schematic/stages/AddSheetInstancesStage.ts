import type { CircuitJson } from "circuit-json"
import type { KicadSch } from "kicadts"
import {
  SheetInstancesRoot,
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
  _step(): void {
    const { kicadSch } = this.ctx

    // Create sheet_instances section using SheetInstancesRoot
    const sheetInstances = new SheetInstancesRoot()

    // Add root path
    const path = new SheetInstancesRootPath()
    path.value = "/"

    const page = new SheetInstancesRootPage()
    page.value = "1"

    // Set pages array directly instead of pushing
    path.pages = [page]

    sheetInstances.paths = [path]
    kicadSch.sheetInstances = sheetInstances

    // Set embedded_fonts to no
    kicadSch.embeddedFonts = new EmbeddedFonts(false)

    this.finished = true
  }

  getOutput(): KicadSch {
    return this.ctx.kicadSch
  }
}
