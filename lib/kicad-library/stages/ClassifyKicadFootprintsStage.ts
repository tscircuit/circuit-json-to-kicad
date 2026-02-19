import type { KicadFootprintMetadata } from "@tscircuit/props"
import type { PcbComponent } from "circuit-json"
import type { FootprintEntry } from "../../types"
import type {
  KicadLibraryConverterContext,
  ExtractedKicadComponent,
} from "../KicadLibraryConverterTypes"
import { renameKicadFootprint } from "../kicad-library-converter-utils/renameKicadFootprint"
import { applyKicadFootprintMetadata } from "../kicad-library-converter-utils/applyKicadFootprintMetadata"
import { parseKicadMod } from "kicadts"

const KICAD_3RD_PARTY_PLACEHOLDER = "${KICAD_3RD_PARTY}"

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

  // Get metadata from circuit-json pcb_component element
  const builtComponent = ctx.builtTscircuitComponents.find(
    (c) => c.tscircuitComponentName === tscircuitComponentName,
  )
  const pcbComponent = builtComponent?.circuitJson.find(
    (el): el is PcbComponent => el.type === "pcb_component",
  )
  const metadata = pcbComponent?.metadata?.kicad_footprint as
    | KicadFootprintMetadata
    | undefined

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
          isPcm: ctx.isPcm,
          kicadPcmPackageId: ctx.kicadPcmPackageId,
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
    // Update 3D model paths for PCM if needed
    if (ctx.isPcm && ctx.kicadPcmPackageId) {
      const updatedFootprint = updateBuiltinFootprintModelPaths({
        kicadFootprint,
        kicadPcmPackageId: ctx.kicadPcmPackageId,
      })
      ctx.builtinKicadFootprints.push(updatedFootprint)
    } else {
      ctx.builtinKicadFootprints.push(kicadFootprint)
    }
  }
}

/**
 * Updates 3D model paths in a builtin footprint for PCM compatibility.
 */
function updateBuiltinFootprintModelPaths({
  kicadFootprint,
  kicadPcmPackageId,
}: {
  kicadFootprint: FootprintEntry
  kicadPcmPackageId: string
}): FootprintEntry {
  const footprint = parseKicadMod(kicadFootprint.kicadModString)

  for (const model of footprint.models) {
    const currentPath = model.path
    const usesProjectPath =
      currentPath.includes("${KIPRJMOD}/") || /3dmodels[\\/]/.test(currentPath)
    if (usesProjectPath) {
      // Extract the filename from the path
      const filename = currentPath.split(/[\\/]/).pop() ?? ""
      // PCM format: ${KICAD_3RD_PARTY}/3dmodels/<kicadPcmPackageId>/tscircuit_builtin.3dshapes/<model>.step
      model.path = `${KICAD_3RD_PARTY_PLACEHOLDER}/3dmodels/${kicadPcmPackageId}/tscircuit_builtin.3dshapes/${filename}`
    }
  }

  return {
    footprintName: kicadFootprint.footprintName,
    kicadModString: footprint.getString(),
    model3dSourcePaths: kicadFootprint.model3dSourcePaths,
    isBuiltin: kicadFootprint.isBuiltin,
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
