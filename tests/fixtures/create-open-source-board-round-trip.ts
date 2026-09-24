import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { type KicadPcb, parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "../../lib"
import { createSideBySideSvg } from "./create-side-by-side-svg"
import { stackPngsHorizontally } from "./stackPngsHorizontally"
import { takeKicadSnapshot } from "./take-kicad-snapshot"

type OpenSourceBoardRoundTripOptions = {
  boardName: string
  filename: string
}

type SupportedBoardCounts = {
  copperPours: number
  footprints: number
  pads: number
  segments: number
  vias: number
}

type AssemblyExclusionCounts = {
  excludedFromBom: number
  excludedFromPositionFiles: number
}

type FootprintTransform = {
  layer: "top" | "bottom"
  reference: string
  rotation: number
}

function getNativeCounts(
  pcb: KicadPcb,
  copperPours: number,
): SupportedBoardCounts {
  return {
    copperPours,
    footprints: pcb.footprints.length,
    pads: pcb.footprints.reduce(
      (total, footprint) => total + footprint.fpPads.length,
      0,
    ),
    segments: pcb.segments.length,
    vias: pcb.vias.length,
  }
}

function getAssemblyExclusionCounts(pcb: KicadPcb): AssemblyExclusionCounts {
  return {
    excludedFromBom: pcb.footprints.filter(
      (footprint) => footprint.attr?.excludeFromBom,
    ).length,
    excludedFromPositionFiles: pcb.footprints.filter(
      (footprint) => footprint.attr?.excludeFromPosFiles,
    ).length,
  }
}

function getFootprintTransforms(pcb: KicadPcb): FootprintTransform[] {
  return pcb.footprints
    .flatMap((footprint) => {
      const reference =
        footprint.properties.find((property) => property.key === "Reference")
          ?.value ??
        footprint.fpTexts.find((text) => text.type === "reference")?.text
      if (!reference) return []

      return [
        {
          layer: footprint.layer?.getString().includes("B.Cu")
            ? ("bottom" as const)
            : ("top" as const),
          reference,
          rotation:
            footprint.position && "angle" in footprint.position
              ? (footprint.position.angle ?? 0)
              : 0,
        },
      ]
    })
    .sort((left, right) => left.reference.localeCompare(right.reference))
}

type EdgeGraphic = {
  getString(): string
  stroke?: { width?: number }
  width?: number
}

function getEdgeCutsWidth(pcb: KicadPcb): number | undefined {
  const graphics: EdgeGraphic[] = [
    ...pcb.graphicArcs,
    ...pcb.graphicCircles,
    ...pcb.graphicCurves,
    ...pcb.graphicLines,
    ...pcb.graphicRects,
  ]
  for (const graphic of graphics) {
    if (!graphic.getString().includes("(layer Edge.Cuts)")) continue
    const width = graphic.stroke?.width ?? graphic.width
    if (width !== undefined && Number.isFinite(width)) return width
  }
  return undefined
}

export async function createOpenSourceBoardRoundTrip({
  boardName,
  filename,
}: OpenSourceBoardRoundTripOptions) {
  const sourcePath = resolve(
    import.meta.dir,
    "..",
    "..",
    "references",
    filename,
  )
  const sourceText = await readFile(sourcePath, "utf8")
  const sourcePcb = parseKicadPcb(sourceText)
  const sourceEdgeCutsWidth = getEdgeCutsWidth(sourcePcb)

  const sourceConverter = new KicadToCircuitJsonConverter()
  sourceConverter.addFile(filename, sourceText)
  sourceConverter.runUntilFinished()
  const sourceCircuitJson = sourceConverter.getOutput()

  const converter = new CircuitJsonToKicadPcbConverter(
    sourceCircuitJson as any,
    {
      edgeCutsWidth: sourceEdgeCutsWidth,
      projectName: boardName,
    },
  )
  converter.runUntilFinished()
  const roundTripText = converter.getOutputString()
  const roundTripPcb = parseKicadPcb(roundTripText)
  const roundTripEdgeCutsWidth = getEdgeCutsWidth(roundTripPcb)

  const roundTripConverter = new KicadToCircuitJsonConverter()
  roundTripConverter.addFile(filename, roundTripText)
  roundTripConverter.runUntilFinished()

  const sourceStats = sourceConverter.getStats()
  const sourceCounts = getNativeCounts(sourcePcb, sourceStats.copper_pours ?? 0)
  const roundTripCounts = getNativeCounts(
    roundTripPcb,
    roundTripPcb.zones.length,
  )
  const sourceAssemblyExclusionCounts = getAssemblyExclusionCounts(sourcePcb)
  const roundTripAssemblyExclusionCounts =
    getAssemblyExclusionCounts(roundTripPcb)
  const sourceFootprintTransforms = getFootprintTransforms(sourcePcb)
  const roundTripFootprintTransforms = getFootprintTransforms(roundTripPcb)
  const sourceNetNames = [
    "",
    ...sourceCircuitJson
      .filter((element) => element.type === "source_net")
      .map((net) => net.name),
  ].sort()
  const roundTripNetNames = roundTripPcb.nets.map((net) => net.name).sort()
  const sourcePrimitiveTotal = Object.values(sourceCounts).reduce(
    (sum, count) => sum + count,
    0,
  )
  const sourceFabricationPathSegmentCount = sourceCircuitJson
    .filter((element) => element.type === "pcb_fabrication_note_path")
    .reduce((count, path) => count + Math.max(0, path.route.length - 1), 0)
  const roundTripFabricationLineCount = roundTripPcb.footprints.reduce(
    (count, footprint) =>
      count +
      footprint.fpLines.filter((line) => String(line.layer).includes(".Fab"))
        .length,
    0,
  )

  const [sourceSnapshot, roundTripSnapshot] = await Promise.all([
    takeKicadSnapshot({
      includeSvg: true,
      kicadFilePath: sourcePath,
      kicadFileType: "pcb",
      pcbDrillHoleColor: "white",
      pcbCopperPourOpacity: 0.35,
    }),
    takeKicadSnapshot({
      includeSvg: true,
      kicadFileContent: roundTripText,
      kicadFileType: "pcb",
      pcbDrillHoleColor: "white",
      pcbCopperPourOpacity: 0.35,
    }),
  ])
  const sourceSvg =
    sourceSnapshot.generatedFileContent["temp_file.svg"]!.toString("utf8")
  const roundTripSvg =
    roundTripSnapshot.generatedFileContent["temp_file.svg"]!.toString("utf8")

  return {
    comparisonPng: await stackPngsHorizontally([
      sourceSnapshot.generatedFileContent["temp_file.png"]!,
      roundTripSnapshot.generatedFileContent["temp_file.png"]!,
    ]),
    comparisonSvg: createSideBySideSvg(sourceSvg, roundTripSvg),
    roundTripAssemblyExclusionCounts,
    roundTripCounts,
    roundTripEdgeCutsWidth,
    roundTripFabricationLineCount,
    roundTripFootprintTransforms,
    roundTripNetNames,
    roundTripWarnings: roundTripConverter.getWarnings(),
    roundTripSvg,
    sourceCounts,
    sourceAssemblyExclusionCounts,
    sourceEdgeCutsWidth,
    sourceFabricationPathSegmentCount,
    sourceFootprintTransforms,
    sourceNetNames,
    sourcePrimitiveTotal,
    sourceSvg,
    sourceWarnings: sourceConverter.getWarnings(),
  }
}
