import type { FootprintEntry } from "../../types"
import type {
  KicadLibraryConverterContext,
  ExtractedKicadComponent,
} from "../KicadLibraryConverterTypes"
import { renameKicadFootprint } from "../kicad-library-converter-utils/renameKicadFootprint"
import { applyKicadFootprintMetadata } from "../kicad-library-converter-utils/applyKicadFootprintMetadata"

/**
 * Classifies footprints from extracted KiCad components into user and builtin libraries.
 * - Custom footprints (isBuiltin=false) → user library, renamed to component name
 * - Builtin footprints (isBuiltin=true) → builtin library
 */
export function classifyKicadFootprints(
  ctx: KicadLibraryConverterContext,
): void {
  for (const extractedKicadComponent of ctx.extractedKicadComponents) {
    classifyFootprintsForComponent({
      ctx,
      extractedKicadComponent,
    })
  }
}

function classifyFootprintsForComponent({
  ctx,
  extractedKicadComponent,
}: {
  ctx: KicadLibraryConverterContext
  extractedKicadComponent: ExtractedKicadComponent
}): void {
  const { tscircuitComponentName, kicadFootprints } = extractedKicadComponent
  let hasAddedUserFootprint = false

  // Get metadata for this component if available
  const metadata = ctx.footprintMetadataMap.get(tscircuitComponentName)

  for (const kicadFootprint of kicadFootprints) {
    if (kicadFootprint.isBuiltin) {
      addBuiltinFootprint({ ctx, kicadFootprint })
    } else {
      // First custom footprint gets renamed to component name
      if (!hasAddedUserFootprint) {
        hasAddedUserFootprint = true
        let renamedFootprint = renameKicadFootprint({
          kicadFootprint,
          newKicadFootprintName: tscircuitComponentName,
          kicadLibraryName: ctx.kicadLibraryName,
        })

        // Apply kicadFootprintMetadata if available
        if (metadata) {
          renamedFootprint = {
            ...renamedFootprint,
            kicadModString: applyKicadFootprintMetadata(
              renamedFootprint.kicadModString,
              metadata,
              tscircuitComponentName,
            ),
          }
        }

        addUserFootprint({ ctx, kicadFootprint: renamedFootprint })
      } else {
        addUserFootprint({ ctx, kicadFootprint })
      }
    }
  }
}

function addUserFootprint({
  ctx,
  kicadFootprint,
}: {
  ctx: KicadLibraryConverterContext
  kicadFootprint: FootprintEntry
}): void {
  const alreadyExists = ctx.userKicadFootprints.some(
    (fp) => fp.footprintName === kicadFootprint.footprintName,
  )
  if (!alreadyExists) {
    ctx.userKicadFootprints.push(kicadFootprint)
  }
}

function addBuiltinFootprint({
  ctx,
  kicadFootprint,
}: {
  ctx: KicadLibraryConverterContext
  kicadFootprint: FootprintEntry
}): void {
  const alreadyExists = ctx.builtinKicadFootprints.some(
    (fp) => fp.footprintName === kicadFootprint.footprintName,
  )
  if (!alreadyExists) {
    // Builtin footprints use relative paths which work for both standalone and PCM
    ctx.builtinKicadFootprints.push(kicadFootprint)
  }
}

/**
 * Checks if an extracted KiCad component has a custom footprint.
 */
export function componentHasCustomFootprint(
  extractedKicadComponent: ExtractedKicadComponent,
): boolean {
  return extractedKicadComponent.kicadFootprints.some((fp) => !fp.isBuiltin)
}
