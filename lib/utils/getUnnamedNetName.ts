import { type cju, createBoardOwnerMap } from "@tscircuit/circuit-json-util"
import type {
  CircuitJson,
  SchematicComponent,
  SchematicPort,
  SourceComponentBase,
  SourcePort,
  SourceTrace,
} from "circuit-json"
import { resolveKicadPcbNetName } from "../pcb/utils/resolveKicadPcbNetName"
import { buildSchematicSheetPlan } from "../schematic/buildSchematicSheetPlan"
import { getSchematicSymbolData } from "../schematic/getSchematicSymbolData"
import { resolveSchematicComponentSymbol } from "../schematic/resolveSchematicComponentSymbol"
import { getPhysicalPinName } from "./getPhysicalPinName"

/**
 * Generates a deterministic, KiCad-friendly fallback net name for an unnamed
 * trace (a `source_trace` that has no corresponding `source_net` and no
 * connected component pins from which to derive a `Net-(<Ref>-...)` name).
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

/**
 * Determines whether the library symbol created by `AddLibrarySymbolsStage` for
 * `sourceComponent` / `schematicComponent` uses port `display_pin_label`s
 * (chips and custom schematic symbols) rather than builtin `schematic-symbols`
 * numeric labels (`"1"`, `"2"`, ...).
 */
function componentUsesCustomPinLabels({
  circuitJson,
  sourceComponent,
  schematicComponent,
  cadComponents,
}: {
  circuitJson: CircuitJson
  sourceComponent: SourceComponentBase
  schematicComponent?: SchematicComponent
  cadComponents: ReturnType<typeof cju>["cad_component"] extends {
    list: () => infer T
  }
    ? T
    : never
}): boolean {
  const isChip =
    sourceComponent.ftype === "simple_chip" ||
    sourceComponent.ftype === "simple_pin_header" ||
    sourceComponent.ftype === "simple_connector"

  if (!schematicComponent) {
    return isChip
  }

  const symbolContext = resolveSchematicComponentSymbol({
    circuitJson,
    schematicComponent,
    sourceComponent,
    cadComponents,
  })
  if (
    symbolContext.schematicSymbolId ||
    symbolContext.usesComponentLevelSymbolPrimitives
  ) {
    return true
  }

  if (
    schematicComponent.symbol_name &&
    getSchematicSymbolData(schematicComponent.symbol_name)
  ) {
    return false
  }

  return isChip
}

function getPinShownName({
  sourcePort,
  schematicPort,
  usesCustomPinLabels,
  pinNum,
}: {
  sourcePort: SourcePort
  schematicPort?: SchematicPort
  usesCustomPinLabels: boolean
  pinNum: string
}): string {
  if (!usesCustomPinLabels) {
    return pinNum
  }

  const customLabel =
    schematicPort?.display_pin_label ||
    (sourcePort.name && !/^pin\d+$/i.test(sourcePort.name)
      ? sourcePort.name
      : undefined) ||
    pinNum

  return customLabel === "~" ? "" : customLabel
}

/**
 * Computes KiCad's `SCH_PIN::GetDefaultNetName` for a connected `source_port`:
 * - `Net-(<Ref>-<PinName>)` when the library symbol pin has a non-empty shown
 *   name distinct from its pin number (or `Net-(<Ref>-<PinName>-Pad<PinNum>)`
 *   when multiple pins on the same symbol share `<PinName>`).
 * - `Net-(<Ref>-Pad<PinNum>)` otherwise (passive/builtin symbols whose library
 *   pin name equals its pin number).
 */
function getKicadPinDefaultNetName({
  sourcePort,
  sourceComponent,
  schematicPort,
  componentPorts,
  schematicPortsBySourcePortId,
  usesCustomPinLabels,
}: {
  sourcePort: SourcePort
  sourceComponent: SourceComponentBase
  schematicPort?: SchematicPort
  componentPorts: SourcePort[]
  schematicPortsBySourcePortId: ReadonlyMap<string, SchematicPort>
  usesCustomPinLabels: boolean
}): string | undefined {
  const ref = sourceComponent.name?.trim()
  if (!ref) return undefined

  const pinNum = String(schematicPort?.pin_number ?? sourcePort.pin_number ?? 1)
  const rawPinNumber = getPhysicalPinName(sourcePort) ?? pinNum
  const shownNumber = rawPinNumber === "~" ? "" : rawPinNumber
  const shownName = getPinShownName({
    sourcePort,
    schematicPort,
    usesCustomPinLabels,
    pinNum,
  })

  if (shownName !== "" && shownName !== shownNumber) {
    const hasDuplicatePinName = componentPorts.some((otherPort) => {
      if (otherPort.source_port_id === sourcePort.source_port_id) return false
      const otherSchematicPort = schematicPortsBySourcePortId.get(
        otherPort.source_port_id,
      )
      const otherPinNum = String(
        otherSchematicPort?.pin_number ?? otherPort.pin_number ?? 1,
      )
      const otherShownName = getPinShownName({
        sourcePort: otherPort,
        schematicPort: otherSchematicPort,
        usesCustomPinLabels,
        pinNum: otherPinNum,
      })
      return otherShownName === shownName
    })

    if (hasDuplicatePinName && shownNumber !== "") {
      return `Net-(${ref}-${shownName}-Pad${shownNumber})`
    }
    return `Net-(${ref}-${shownName})`
  }

  return `Net-(${ref}-Pad${shownNumber})`
}

/**
 * Picks the winning default net name across all pins on an unnamed net using
 * KiCad's `CONNECTION_SUBGRAPH::ResolveDrivers` rule:
 * 1. Prefer pin names without `"-Pad"` (named chip/symbol pins like
 *    `Net-(U1-FB)`) over pin names with `"-Pad"` (`Net-(R2-Pad1)`).
 * 2. Break ties by standard code-unit order (`candidate < winningName`, e.g.
 *    `"Net-(C1-Pad1)" < "Net-(R1-Pad2)"` and
 *    `"Net-(R10-Pad1)" < "Net-(R2-Pad2)"`).
 */
function pickWinningKicadDefaultNetName(
  candidateNames: Iterable<string>,
): string | undefined {
  let winningName: string | undefined
  for (const candidate of candidateNames) {
    if (
      winningName === undefined ||
      (winningName.includes("-Pad") && !candidate.includes("-Pad")) ||
      (winningName.includes("-Pad") === candidate.includes("-Pad") &&
        candidate < winningName)
    ) {
      winningName = candidate
    }
  }
  return winningName
}

export interface ResolvedUnnamedTraceNet {
  connectivityKey: string
  /** Base net name (before sheet or multi-board panel prefix) */
  labelName: string
  /** Full resolved KiCad PCB net name matching KiCad's schematic netlist */
  pcbNetName: string
  /** True when a trace-backed `schematic_text` already provides an inline label for this net */
  hasInlineLabel: boolean
}

/**
 * Resolves net names for all unnamed traces (traces whose connectivity key
 * is not already claimed by a `source_net`).
 *
 * When the trace connects component pins, derives KiCad's exact default
 * schematic net name (`Net-(<Ref>-<Pin>)` / `Net-(<Ref>-Pad<Pin>)`) so
 * `.kicad_sch` and `.kicad_pcb` agree without adding extra labels to the
 * schematic.
 */
export function resolveUnnamedTraceNets(
  circuitJson: CircuitJson,
  db: ReturnType<typeof cju>,
): Map<string, ResolvedUnnamedTraceNet> {
  const boardOwnerMap =
    db.pcb_board.list().length > 1
      ? createBoardOwnerMap(circuitJson)
      : undefined

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

  // Map connectivity keys to their schematic sheet (used when an inline schematic_text label is present)
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

  // Index source_ports, schematic_ports, and schematic_components for KiCad default net name derivation
  const sourcePorts = db.source_port?.list() ?? []
  const sourcePortById = new Map<string, SourcePort>()
  const sourcePortsByComponentId = new Map<string, SourcePort[]>()
  const sourcePortsByKey = new Map<string, SourcePort[]>()
  for (const port of sourcePorts) {
    sourcePortById.set(port.source_port_id, port)
    if (port.source_component_id) {
      const list = sourcePortsByComponentId.get(port.source_component_id) ?? []
      list.push(port)
      sourcePortsByComponentId.set(port.source_component_id, list)
    }
    if (port.subcircuit_connectivity_map_key) {
      const list =
        sourcePortsByKey.get(port.subcircuit_connectivity_map_key) ?? []
      list.push(port)
      sourcePortsByKey.set(port.subcircuit_connectivity_map_key, list)
    }
  }

  const schematicPortsBySourcePortId = new Map<string, SchematicPort>()
  for (const schPort of db.schematic_port?.list() ?? []) {
    if (
      schPort.source_port_id &&
      !schematicPortsBySourcePortId.has(schPort.source_port_id)
    ) {
      schematicPortsBySourcePortId.set(schPort.source_port_id, schPort)
    }
  }

  const schematicComponentBySourceId = new Map<string, SchematicComponent>()
  for (const schComp of db.schematic_component?.list() ?? []) {
    if (
      schComp.source_component_id &&
      !schematicComponentBySourceId.has(schComp.source_component_id)
    ) {
      schematicComponentBySourceId.set(schComp.source_component_id, schComp)
    }
  }

  const cadComponents = db.cad_component?.list?.() ?? []
  const customPinLabelCache = new Map<string, boolean>()

  // Group all source_traces by connectivity key so multi-segment unnamed nets consider all connected ports
  const tracesByKey = new Map<string, SourceTrace[]>()
  for (const sourceTrace of db.source_trace?.list() ?? []) {
    const key = getSourceTraceConnectivityKey(db, sourceTrace)
    if (!key || namedKeys.has(key)) continue
    const list = tracesByKey.get(key) ?? []
    list.push(sourceTrace)
    tracesByKey.set(key, list)
  }

  const result = new Map<string, ResolvedUnnamedTraceNet>()
  for (const [key, traces] of tracesByKey.entries()) {
    const primaryTrace = traces[0]!
    const boardId = boardOwnerMap?.get(
      primaryTrace.subcircuit_id ?? "",
    )?.pcb_board_id

    const inlineLabel = inlineLabelByKey.get(key)
    if (inlineLabel) {
      const sheetInfo = traceSheetInfoByKey.get(key)
      const sheetName = sheetInfo?.sheetName ?? null
      const prefixedInlineLabel = sheetName
        ? `/${sheetName}/${inlineLabel}`
        : `/${inlineLabel}`
      const pcbNetName = resolveKicadPcbNetName({
        candidateName: prefixedInlineLabel,
        connectivityKey: key,
        boardId,
      })
      usedNames.add(pcbNetName)
      result.set(key, {
        connectivityKey: key,
        labelName: inlineLabel,
        pcbNetName,
        hasInlineLabel: true,
      })
      continue
    }

    // Collect all connected source_ports for this connectivity key
    const connectedPorts = new Map<string, SourcePort>()
    for (const port of sourcePortsByKey.get(key) ?? []) {
      connectedPorts.set(port.source_port_id, port)
    }
    for (const trace of traces) {
      for (const portId of trace.connected_source_port_ids ?? []) {
        const port = sourcePortById.get(portId)
        if (port) {
          connectedPorts.set(port.source_port_id, port)
        }
      }
    }

    const candidatePinNetNames: string[] = []
    for (const port of connectedPorts.values()) {
      if (!port.source_component_id) continue
      const sourceComponent = db.source_component?.get(port.source_component_id)
      if (!sourceComponent) continue
      const schematicComponent = schematicComponentBySourceId.get(
        port.source_component_id,
      )
      let usesCustomPinLabels = customPinLabelCache.get(
        port.source_component_id,
      )
      if (usesCustomPinLabels === undefined) {
        usesCustomPinLabels = componentUsesCustomPinLabels({
          circuitJson,
          sourceComponent,
          schematicComponent,
          cadComponents,
        })
        customPinLabelCache.set(port.source_component_id, usesCustomPinLabels)
      }

      const defaultPinNetName = getKicadPinDefaultNetName({
        sourcePort: port,
        sourceComponent,
        schematicPort: schematicPortsBySourcePortId.get(port.source_port_id),
        componentPorts: sourcePortsByComponentId.get(
          port.source_component_id,
        ) ?? [port],
        schematicPortsBySourcePortId,
        usesCustomPinLabels,
      })
      if (defaultPinNetName) {
        candidatePinNetNames.push(defaultPinNetName)
      }
    }

    const kicadDefaultNetName =
      pickWinningKicadDefaultNetName(candidatePinNetNames)

    let pcbNetName: string
    let labelName: string
    if (kicadDefaultNetName) {
      labelName = kicadDefaultNetName
      pcbNetName = resolveKicadPcbNetName({
        candidateName: kicadDefaultNetName,
        connectivityKey: key,
        boardId,
      })
      if (usedNames.has(pcbNetName)) {
        let suffix = 2
        while (usedNames.has(`${pcbNetName}_${suffix}`)) {
          suffix++
        }
        pcbNetName = `${pcbNetName}_${suffix}`
      }
      usedNames.add(pcbNetName)
    } else {
      const baseName = resolveKicadPcbNetName({
        candidateName: getUnnamedNetName(primaryTrace, key),
        connectivityKey: key,
        boardId,
      })
      pcbNetName = baseName
      if (usedNames.has(pcbNetName)) {
        let suffix = 2
        while (usedNames.has(`${baseName}_${suffix}`)) {
          suffix++
        }
        pcbNetName = `${baseName}_${suffix}`
      }
      labelName = pcbNetName
      usedNames.add(pcbNetName)
    }

    result.set(key, {
      connectivityKey: key,
      labelName,
      pcbNetName,
      hasInlineLabel: false,
    })
  }

  return result
}
