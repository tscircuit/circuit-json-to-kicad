import { parseKicadMod } from "kicadts"
import type { FootprintEntry } from "../../types"

export function resolveFootprintModelPaths(
  entries: FootprintEntry[],
  paths: Map<string, string>,
): void {
  for (const entry of entries) {
    const footprint = parseKicadMod(entry.kicadModString)
    for (const [index, model] of footprint.models.entries()) {
      const source = entry.model3dSourcePaths[index]
      const path = source ? paths.get(source) : undefined
      if (path) model.path = `../../${path}`
    }
    entry.kicadModString = footprint.getString()
  }
}
