import type { FootprintEntry } from "../../types"
import { parseKicadMod } from "kicadts"

const KICAD_3RD_PARTY_VAR = "${KICAD_3RD_PARTY}"

/**
 * Rename a KiCad footprint entry to use a new name.
 */
export function renameKicadFootprint(params: {
  kicadFootprint: FootprintEntry
  newKicadFootprintName: string
  kicadLibraryName: string
  /** When true, use PCM-compatible 3D model paths */
  useKicadPcmPaths?: boolean
  /** The KiCad PCM package identifier (e.g., "com_tscircuit_author_package") */
  kicadPcmPackageId?: string
}): FootprintEntry {
  const {
    kicadFootprint,
    newKicadFootprintName,
    kicadLibraryName,
    useKicadPcmPaths,
    kicadPcmPackageId,
  } = params

  const footprint = parseKicadMod(kicadFootprint.kicadModString)

  // Update the footprint name (libraryLink)
  footprint.libraryLink = newKicadFootprintName

  // Update 3D model paths to use the correct library name
  for (const model of footprint.models) {
    const currentPath = model.path
    const usesProjectPath =
      currentPath.includes("${KIPRJMOD}/") || /3dmodels[\\/]/.test(currentPath)
    if (usesProjectPath) {
      // Extract the filename from the path
      const filename = currentPath.split(/[\\/]/).pop() ?? ""

      if (useKicadPcmPaths && kicadPcmPackageId) {
        // PCM format: ${KICAD_3RD_PARTY}/3dmodels/<kicadPcmPackageId>/<library>.3dshapes/<model>.step
        model.path = `${KICAD_3RD_PARTY_VAR}/3dmodels/${kicadPcmPackageId}/${kicadLibraryName}.3dshapes/${filename}`
      } else {
        // Standard format: relative path
        model.path = `../../3dmodels/${kicadLibraryName}.3dshapes/${filename}`
      }
    }
  }

  return {
    footprintName: newKicadFootprintName,
    kicadModString: footprint.getString(),
    model3dSourcePaths: kicadFootprint.model3dSourcePaths,
  }
}
