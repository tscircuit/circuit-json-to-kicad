const KICAD_FOOTPRINT_VERSION = 20241229
const KICAD_FOOTPRINT_GENERATOR = "pcbnew"
const KICAD_FOOTPRINT_GENERATOR_VERSION = "9.0"

/**
 * Post-process footprint string to add version, generator, and generator_version
 * which are required by KiCad 9.0+ for .kicad_mod files
 */
export function addFootprintMetadata(kicadModString: string): string {
  // Find the position after the footprint name (first quoted string after "(footprint")
  const footprintMatch = kicadModString.match(/^\(footprint\s+"[^"]+"\s*/)
  if (!footprintMatch) {
    return kicadModString
  }

  const insertPosition = footprintMatch[0].length
  const metadata = `(version ${KICAD_FOOTPRINT_VERSION})\n  (generator "${KICAD_FOOTPRINT_GENERATOR}")\n  (generator_version "${KICAD_FOOTPRINT_GENERATOR_VERSION}")\n  `

  return (
    kicadModString.slice(0, insertPosition) +
    metadata +
    kicadModString.slice(insertPosition)
  )
}
