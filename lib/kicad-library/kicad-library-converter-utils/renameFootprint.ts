import type { FootprintEntry } from "./../../types"

/**
 * Rename a footprint entry to use a new name.
 */
export function renameFootprint(params: {
  fp: FootprintEntry
  newName: string
  libraryName: string
}): FootprintEntry {
  const { fp, newName, libraryName } = params
  const oldName = fp.footprintName
  // Update the footprint name in the kicad_mod string
  // Handle both inline format: (footprint "name" and multiline format: (footprint\n  "name"
  let kicadModString = fp.kicadModString.replace(
    new RegExp(
      `\\(footprint\\s*\\n?\\s*"${oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
    ),
    `(footprint\n  "${newName}"`,
  )

  // Update 3D model paths to use the correct library name
  kicadModString = kicadModString.replace(
    /\$\{KIPRJMOD\}\/[^/]+\.3dshapes\//g,
    `\${KIPRJMOD}/3dmodels/${libraryName}.3dshapes/`,
  )

  return {
    footprintName: newName,
    kicadModString,
    model3dSourcePaths: fp.model3dSourcePaths,
  }
}
