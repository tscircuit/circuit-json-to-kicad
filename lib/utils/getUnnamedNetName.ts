import {
  type cju,
  createBoardOwnerMap,
} from "@tscircuit/circuit-json-util"
import type { CircuitJson, SourceTrace } from "circuit-json"
import { resolveKicadPcbNetName } from "../pcb/utils/resolveKicadPcbNetName"
import { buildSchematicSheetPlan } from "../schematic/buildSchematicSheetPlan"

/**
 * Generates a deterministic, KiCad-friendly net name for an unnamed trace
 * (a `source_trace` that has no corresponding `source_net`).
 *
 * Uses `source_trace.display_name` when available (e.g. ".R1 > .pin1 to .C1 > .pin1"),
 * sanitized into a compact identifier ("R1_.pin1_to_.C1_.pin1"), or falls back
 * to `source_trace_id` / `connectivityKey`.
 */
export function getUnnamedNetName(
  sourceTrace: {
    display_name?: string
    source_trace_id: string
  },
  connectivityKey?: string,
): string {
  const raw =
    sourceTrace.display_name || sourceTrace.source_trace_id || connectivityKey
  if (!raw || raw.trim().length === 0) {
    return connectivityKey || "Net_unnamed"
  }

  return sanitizeUnnamedNetName(raw)
}

/**
 * Sanitizes a raw trace display_name or ID into a clean net name suitable
 * for both KiCad schematic labels and PCB net definitions.
 *
 * For example: ".R1 > .pin1 to .C1 > .pin1" -> "R1_.pin1_to_.C1_.pin1"
 */
function sanitizeUnnamedNetName(raw: string): string {
  const sanitized = raw
    .trim()
    .replace(/^\.+/, "")
    .replace(/\s*>\s*/g, "_")
    .replace(/[^A-Za-z0-9_.+-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
  return sanitized.length > 0 ? sanitized : raw.trim()
}

/**
 * Resolves the connectivity key for a `source_trace`, checking both its own
 * `subcircuit_connectivity_map_key` and any connected `source_net`s.
 */
export function getSourceTraceConnectivityKey(
  db: ReturnType<typeof cju>,
  sourceTrace: SourceTrace,
): string | undefined {
  let connectivityKey = sourceTrace.subcircuit_connectivity_map_key

  if (!connectivityKey && sourceTrace.connected_source_net_ids?.length) {
    for (const sourceNetId of sourceTrace.connected_source_net_ids) {
      const connectedNet = db.source_net?.get(sourceNetId)
      if (
        connectedNet?.subcircuit_connectivity_map_key &&
        connectedNet.subcircuit_connectivity_map_key.length > 0
      ) {
        connectivityKey = connectedNet.subcircuit_connectivity_map_key
        break
      }
    }
  }

  return connectivityKey
}

export interface ResolvedUnnamedTraceNet {
  connectivityKey: string
  /** Local label text placed on the schematic sheet (without leading sheet path `/`) */
  labelName: string
  /** Full resolved KiCad PCB net name (including `/<labelName>` or `/<sheetName>/<labelName>` when backed by a schematic trace) */
  pcbNetName: string
  /** True when a trace-backed `schematic_text` already provides an inline label for this net */
  hasInlineLabel: boolean
}

/**
 * Resolves net names for all unnamed traces (traces whose connectivity key
 * is not already claimed by a `source_net`).
 *
 * Ensures deterministic disambiguation across connectivity keys when two
 * distinct traces sanitize to the same candidate name (e.g. `DATA/A` and
 * `DATA_A`), and computes both the local schematic `Label` text and the
 * hierarchical/root-prefixed KiCad PCB net name (`/<labelName>` or
 * `/<sheetName>/<labelName>`) so `.kicad_sch` and `.kicad_pcb` match under
 * `kicad-cli pcb drc --schematic-parity`.
 */
export function resolveUnnamedTraceNets(
  circuitJson: CircuitJson,
  db: ReturnType<typeof cju>,
): Map<string, ResolvedUnnamedTraceNet> {
  const boardOwnerMap =
    db.pcb_board.list().length > 1 ? createBoardOwnerMap(circuitJson) : undefined

  const usedNames = new Set<string>()
  const namedKeys = new Set<string>()
  for (const sourceNet of db.source_net?.list() ?? []) {
    const key =
      sourceNet.subcircuit_connectivity_map_key || sourceNet.source_net_id
    if (!key) continue
    namedKeys.add(key)
    const netName = resolveKicadPcbNetName({
      candidateName: sourceNet.name || sourceNet.source_net_id,
      connectivityKey: key,
      boardId: boardOwnerMap?.get(sourceNet.subcircuit_id ?? "")?.pcb_board_id,
    })
    usedNames.add(netName)
  }

  // Identify connectivity keys that already have a trace-backed inline schematic_text label
  const inlineLabelByKey = new Map<string, string>()
  for (const text of db.schematic_text?.list() ?? []) {
    if (!text.source_trace_id) continue
    const sourceTrace = db.source_trace?.get(text.source_trace_id)
    if (!sourceTrace) continue
    const key = getSourceTraceConnectivityKey(db, sourceTrace)
    if (key && !inlineLabelByKey.has(key)) {
      const labelText = text.text?.trim()
      if (labelText) {
        inlineLabelByKey.set(key, labelText)
        usedNames.add(labelText)
      }
    }
  }

  // Map connectivity keys to their schematic sheet (if any schematic_trace exists)
  const sheetPlan = buildSchematicSheetPlan(circuitJson)
  const sheetNameBySheetId = new Map<string, string>()
  for (const child of sheetPlan.children) {
    sheetNameBySheetId.set(child.schematicSheetId, child.sheetName)
  }

  const traceSheetInfoByKey = new Map<
    string,
    { hasSchematicTrace: boolean; sheetName: string | null }
  >()
  for (const schematicTrace of db.schematic_trace?.list() ?? []) {
    let key = schematicTrace.subcircuit_connectivity_map_key
    if (!key && schematicTrace.source_trace_id) {
      const sourceTrace = db.source_trace?.get(schematicTrace.source_trace_id)
      if (sourceTrace) {
        key = getSourceTraceConnectivityKey(db, sourceTrace)
      }
    }
    if (!key || traceSheetInfoByKey.has(key)) continue
    const sheetId = schematicTrace.schematic_sheet_id ?? null
    const sheetName = sheetId ? (sheetNameBySheetId.get(sheetId) ?? null) : null
    traceSheetInfoByKey.set(key, {
      hasSchematicTrace: true,
      sheetName,
    })
  }

  const result = new Map<string, ResolvedUnnamedTraceNet>()
  for (const sourceTrace of db.source_trace?.list() ?? []) {
    const key = getSourceTraceConnectivityKey(db, sourceTrace)
    if (!key || namedKeys.has(key) || result.has(key)) continue

    const boardId = boardOwnerMap?.get(
      sourceTrace.subcircuit_id ?? "",
    )?.pcb_board_id

    const inlineLabel = inlineLabelByKey.get(key)
    let labelName: string
    if (inlineLabel) {
      labelName = resolveKicadPcbNetName({
        candidateName: inlineLabel,
        connectivityKey: key,
        boardId,
      })
    } else {
      const baseName = resolveKicadPcbNetName({
        candidateName: getUnnamedNetName(sourceTrace, key),
        connectivityKey: key,
        boardId,
      })
      labelName = baseName
      if (usedNames.has(labelName)) {
        let suffix = 2
        while (usedNames.has(`${baseName}_${suffix}`)) {
          suffix++
        }
        labelName = `${baseName}_${suffix}`
      }
      usedNames.add(labelName)
    }

    const sheetInfo = traceSheetInfoByKey.get(key)
    const hasSchematicTrace =
      sheetInfo?.hasSchematicTrace ?? inlineLabel !== undefined
    const sheetName = sheetInfo?.sheetName ?? null
    const pcbNetName = hasSchematicTrace
      ? sheetName
        ? `/${sheetName}/${labelName}`
        : `/${labelName}`
      : labelName

    result.set(key, {
      connectivityKey: key,
      labelName,
      pcbNetName,
      hasInlineLabel: inlineLabel !== undefined,
    })
  }

  return result
}
