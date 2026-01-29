import type { FootprintEntry } from "../../types"
import { parseKicadMod } from "kicadts"

/**
 * Rename a KiCad footprint entry to use a new name.
 */
export function renameKicadFootprint(params: {
  kicadFootprint: FootprintEntry
  newKicadFootprintName: string
  kicadLibraryName: string
}): FootprintEntry {
  const { kicadFootprint, newKicadFootprintName, kicadLibraryName } = params

  const footprint = parseKicadMod(kicadFootprint.kicadModString)

  // Update the footprint name (libraryLink)
  footprint.libraryLink = newKicadFootprintName

  // Update 3D model paths to use relative paths with the correct library name
  // Relative paths work for both standalone and PCM installations since the
  // directory structure (footprints/lib.pretty/ and 3dmodels/lib.3dshapes/) is preserved
  for (const model of footprint.models) {
    const currentPath = model.path
    const usesProjectPath =
      currentPath.includes("${KIPRJMOD}/") || /3dmodels[\\/]/.test(currentPath)
    if (usesProjectPath) {
      // Extract the filename from the path
      const filename = currentPath.split(/[\\/]/).pop() ?? ""
      model.path = `../../3dmodels/${kicadLibraryName}.3dshapes/${filename}`
    }
  }

  return {
    footprintName: newKicadFootprintName,
    kicadModString: footprint.getString(),
    model3dSourcePaths: kicadFootprint.model3dSourcePaths,
  }
}
