import type { KicadFootprintMetadata } from "@tscircuit/props"
import type { PcbComponent, CadComponent, CircuitJson } from "circuit-json"
import type { SourceComponentBase } from "circuit-json"
import type { FootprintEntry } from "../../types"
import type {
  KicadLibraryConverterContext,
  ExtractedKicadComponent,
  BuiltTscircuitComponent,
} from "../KicadLibraryConverterTypes"
import { renameKicadFootprint } from "../kicad-library-converter-utils/renameKicadFootprint"
import { applyKicadFootprintMetadata } from "../kicad-library-converter-utils/applyKicadFootprintMetadata"
import { parseKicadMod } from "kicadts"
import { getKicadCompatibleComponentName } from "../../utils/getKicadCompatibleComponentName"

const KICAD_3RD_PARTY_PLACEHOLDER = "${KICAD_3RD_PARTY}"
// `CircuitJson` is a wide union, so `.find()` needs a narrower element type
// before we can safely pass a source component into the naming helper.
type CircuitJsonElement = CircuitJson[number]
type SourceComponentElement = Extract<
  CircuitJsonElement,
  { type: "source_component" }
>

/**
 * Classifies footprints from extracted KiCad components into user and builtin libraries.
 * - Custom footprints (isBuiltin=false) → user library, renamed to the
 *   component name unless metadata.footprintName overrides it
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

export function getUserKicadFootprintName(params: {
  tscircuitComponentName: string
  metadata?: KicadFootprintMetadata
}): string {
  return params.metadata?.footprintName ?? params.tscircuitComponentName
}

function getFootprintCandidateNamesForPcbComponent(params: {
  circuitJson: CircuitJson
  pcbComponent: PcbComponent
}): Set<string> {
  const { circuitJson, pcbComponent } = params
  const candidateNames = new Set<string>()

  if (pcbComponent.metadata?.kicad_footprint?.footprintName) {
    candidateNames.add(pcbComponent.metadata.kicad_footprint.footprintName)
  }

  const cadComponent = circuitJson.find(
    (el): el is CadComponent =>
      el.type === "cad_component" &&
      el.pcb_component_id === pcbComponent.pcb_component_id,
  )
  const sourceComponentId =
    pcbComponent.source_component_id ?? cadComponent?.source_component_id
  const sourceComponent = sourceComponentId
    ? circuitJson.find(
        (el): el is SourceComponentElement =>
          el.type === "source_component" &&
          el.source_component_id === sourceComponentId,
      )
    : undefined

  if (sourceComponent) {
    candidateNames.add(
      getKicadCompatibleComponentName(
        sourceComponent as SourceComponentBase,
        cadComponent,
      ),
    )
  }

  return candidateNames
}

function resolvePrimaryCustomFootprintPcbComponent(params: {
  builtComponent?: BuiltTscircuitComponent
  extractedKicadComponent: ExtractedKicadComponent
}): PcbComponent | undefined {
  const { builtComponent, extractedKicadComponent } = params
  if (!builtComponent) return undefined

  const primaryCustomFootprint = extractedKicadComponent.kicadFootprints.find(
    (fp) => !fp.isBuiltin,
  )
  if (!primaryCustomFootprint) return undefined

  const pcbComponents = builtComponent.circuitJson.filter(
    (el): el is PcbComponent => el.type === "pcb_component",
  )
  if (pcbComponents.length === 0) return undefined

  const matchingPcbComponent = pcbComponents.find((pcbComponent) =>
    getFootprintCandidateNamesForPcbComponent({
      circuitJson: builtComponent.circuitJson,
      pcbComponent,
    }).has(primaryCustomFootprint.footprintName),
  )
  if (matchingPcbComponent) {
    return matchingPcbComponent
  }

  const pcbComponentsWithMetadata = pcbComponents.filter(
    (pcbComponent) => pcbComponent.metadata?.kicad_footprint,
  )
  if (pcbComponentsWithMetadata.length === 1) {
    return pcbComponentsWithMetadata[0]
  }

  if (pcbComponents.length === 1) {
    return pcbComponents[0]
  }

  return undefined
}

export function resolvePrimaryCustomFootprintMatchNames(params: {
  builtComponent?: BuiltTscircuitComponent
  extractedKicadComponent: ExtractedKicadComponent
}): Set<string> {
  const { builtComponent, extractedKicadComponent } = params
  const matchNames = new Set(
    extractedKicadComponent.kicadFootprints
      .filter((fp) => !fp.isBuiltin)
      .map((fp) => fp.footprintName),
  )

  const pcbComponent = resolvePrimaryCustomFootprintPcbComponent({
    builtComponent,
    extractedKicadComponent,
  })
  if (!pcbComponent || !builtComponent) {
    return matchNames
  }

  for (const candidateName of getFootprintCandidateNamesForPcbComponent({
    circuitJson: builtComponent.circuitJson,
    pcbComponent,
  })) {
    matchNames.add(candidateName)
  }

  return matchNames
}

export function resolvePrimaryCustomFootprintMetadata(params: {
  builtComponent?: BuiltTscircuitComponent
  extractedKicadComponent: ExtractedKicadComponent
}): KicadFootprintMetadata | undefined {
  const pcbComponent = resolvePrimaryCustomFootprintPcbComponent(params)
  return pcbComponent?.metadata?.kicad_footprint as
    | KicadFootprintMetadata
    | undefined
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
  const metadata = resolvePrimaryCustomFootprintMetadata({
    builtComponent,
    extractedKicadComponent,
  })
  const userFootprintName = getUserKicadFootprintName({
    tscircuitComponentName,
    metadata,
  })

  for (const kicadFootprint of kicadFootprints) {
    if (kicadFootprint.isBuiltin) {
      addBuiltinFootprint({ ctx, kicadFootprint })
    } else {
      // First custom footprint becomes the exported user-library footprint.
      if (!hasAddedUserFootprint) {
        hasAddedUserFootprint = true
        let renamedFootprint = kicadFootprint

        // Apply kicadFootprintMetadata if available
        if (metadata) {
          renamedFootprint = {
            ...renamedFootprint,
            kicadModString: applyKicadFootprintMetadata(
              renamedFootprint.kicadModString,
              metadata,
              userFootprintName,
            ),
          }
        }

        renamedFootprint = renameKicadFootprint({
          kicadFootprint: renamedFootprint,
          newKicadFootprintName: userFootprintName,
          kicadLibraryName: ctx.kicadLibraryName,
          isPcm: ctx.isPcm,
          kicadPcmPackageId: ctx.kicadPcmPackageId,
        })

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
