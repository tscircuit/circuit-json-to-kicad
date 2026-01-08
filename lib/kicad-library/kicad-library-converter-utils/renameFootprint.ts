import type { FootprintEntry } from "./../../types"
import { parseKicadMod } from "kicadts"

/**
 * Rename a footprint entry to use a new name.
 */
export function renameFootprint(params: {
  fp: FootprintEntry
  newName: string
  libraryName: string
}): FootprintEntry {
  const { fp, newName, libraryName } = params

  const footprint = parseKicadMod(fp.kicadModString)

  // Update the footprint name (libraryLink)
  footprint.libraryLink = newName

  // Update 3D model paths to use the correct library name
  for (const model of footprint.models) {
    const currentPath = model.path
    if (currentPath.includes("${KIPRJMOD}/")) {
      // Extract the filename from the path
      const filename = currentPath.split("/").pop() ?? ""
      model.path = `\${KIPRJMOD}/3dmodels/${libraryName}.3dshapes/${filename}`
    }
  }

  return {
    footprintName: newName,
    kicadModString: footprint.getString(),
    model3dSourcePaths: fp.model3dSourcePaths,
  }
}
