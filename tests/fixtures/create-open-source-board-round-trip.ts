import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { parseKicadPcb, type KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "../../lib"
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

  const sourceConverter = new KicadToCircuitJsonConverter()
  sourceConverter.addFile(filename, sourceText)
  sourceConverter.runUntilFinished()
  const sourceCircuitJson = sourceConverter.getOutput()

  const converter = new CircuitJsonToKicadPcbConverter(
    sourceCircuitJson as any,
    { projectName: boardName },
  )
  converter.runUntilFinished()
  const roundTripText = converter.getOutputString()
  const roundTripPcb = parseKicadPcb(roundTripText)

  const roundTripConverter = new KicadToCircuitJsonConverter()
  roundTripConverter.addFile(filename, roundTripText)
  roundTripConverter.runUntilFinished()

  const sourceStats = sourceConverter.getStats()
  const sourceCounts = getNativeCounts(sourcePcb, sourceStats.copper_pours ?? 0)
  const roundTripCounts = getNativeCounts(
    roundTripPcb,
    roundTripPcb.zones.length,
  )
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
      kicadFilePath: sourcePath,
      kicadFileType: "pcb",
      pcbDrillHoleColor: "white",
      pcbCopperPourOpacity: 0.35,
    }),
    takeKicadSnapshot({
      kicadFileContent: roundTripText,
      kicadFileType: "pcb",
      pcbDrillHoleColor: "white",
      pcbCopperPourOpacity: 0.35,
    }),
  ])

  return {
    comparisonPng: await stackPngsHorizontally([
      sourceSnapshot.generatedFileContent["temp_file.png"]!,
      roundTripSnapshot.generatedFileContent["temp_file.png"]!,
    ]),
    roundTripCounts,
    roundTripFabricationLineCount,
    roundTripNetNames,
    roundTripWarnings: roundTripConverter.getWarnings(),
    sourceCounts,
    sourceFabricationPathSegmentCount,
    sourceNetNames,
    sourcePrimitiveTotal,
    sourceWarnings: sourceConverter.getWarnings(),
  }
}
