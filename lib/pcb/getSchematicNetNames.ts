import { cju, getElementId } from "@tscircuit/circuit-json-util"
import type { CircuitJson } from "circuit-json"
import type { ConnectivityMap } from "circuit-json-to-connectivity-map"
import { KicadSch } from "kicadts"
import { buildSchematicSheetPlan } from "../schematic/buildSchematicSheetPlan"
import { partitionCircuitJsonBySheet } from "../schematic/partitionCircuitJsonBySheet"
import { resolveSchematicComponentSymbol } from "../schematic/resolveSchematicComponentSymbol"
import { AddLibrarySymbolsStage } from "../schematic/stages/AddLibrarySymbolsStage"
import type { ConverterContext } from "../types"
import { getReferenceDesignator } from "../utils/getKicadCompatibleComponentName"
import { getPhysicalPinName } from "../utils/getPhysicalPinName"

interface PinName {
  reference: string
  number: string
  name: string
  repeatedName: boolean
}

interface NetNames {
  pins: Map<string, PinName>
  labels: { name: string; priority: number }[]
}

// KiCad drops line breaks when naming connections. Its netlist/PCB export
// unescapes internal {slash} sequences back to literal slashes.
const normalizeNetName = (name: string) => name.replace(/[\r\n]/g, "")

function pinNetName(pin: PinName, unconnected: boolean) {
  let name = `${unconnected ? "unconnected" : "Net"}-(${pin.reference}`
  if (pin.name && pin.name !== pin.number) {
    name += `-${normalizeNetName(pin.name)}`
    if (unconnected || pin.repeatedName)
      name += `-Pad${normalizeNetName(pin.number)}`
  } else {
    name += `-Pad${normalizeNetName(pin.number)}`
  }
  return `${name})`
}

// CONNECTION_SUBGRAPH::ResolveDrivers prefers descriptive names over -Pad
// names, then uses a case-sensitive lexical comparison (R10 precedes R2).
function compareNames(a: string, b: string) {
  const quality = Number(a.includes("-Pad")) - Number(b.includes("-Pad"))
  // Ranking happens before KiCad unescapes names for PCB/netlist export.
  const aKey = a.replaceAll("/", "{slash}")
  const bKey = b.replaceAll("/", "{slash}")
  return quality || (aKey < bKey ? -1 : aKey > bKey ? 1 : 0)
}

/**
 * Resolve names from the same pin definitions and labels the schematic exports.
 * This reads connectivity; it never adds schematic labels. KiCad 10's naming
 * rules are checked independently by native-netlist integration tests.
 * PCB-only inputs have no schematic candidates and retain their original names.
 */
export function getSchematicNetNames(
  circuitJson: CircuitJson,
  connectivity: ConnectivityMap,
): Map<string, string> {
  const nets = new Map<string, NetNames>()
  const getNet = (id: string) => {
    const key = connectivity.getNetConnectedToId(id) ?? id
    let net = nets.get(key)
    if (!net) {
      net = { pins: new Map(), labels: [] }
      nets.set(key, net)
    }
    return net
  }

  const plan = buildSchematicSheetPlan(circuitJson)
  for (const sheet of [plan.root, ...plan.children]) {
    const subset = plan.isHierarchical
      ? partitionCircuitJsonBySheet(circuitJson, sheet.schematicSheetId)
      : circuitJson
    const db = cju(subset)

    // Reuse library generation, including custom symbols and physical pin
    // numbering. Only names/numbers are read, so drawing scale is immaterial.
    const ctx: ConverterContext = {
      circuitJson: subset,
      db,
      kicadSch: new KicadSch(),
      kicadSchematicScaleFactor: 1,
    }
    new AddLibrarySymbolsStage(subset, ctx).runUntilFinished()
    const libraries = new Map(
      ctx.kicadSch!.libSymbols!.symbols.map((symbol) => [
        symbol.libraryId,
        symbol,
      ]),
    )
    for (const component of db.schematic_component.list()) {
      const source = component.source_component_id
        ? db.source_component.get(component.source_component_id)
        : undefined
      if (!source) continue
      const resolved = resolveSchematicComponentSymbol({
        circuitJson: subset,
        schematicComponent: component,
        sourceComponent: source,
        cadComponents: db.cad_component.list(),
      })
      const library = libraries.get(
        ctx.schematicComponentLibraryIds?.get(
          component.schematic_component_id,
        ) ?? resolved.libraryId,
      )
      if (!library) continue
      const pins = library.subSymbols.flatMap((symbol) => symbol.pins)
      const reference =
        resolved.schematicSymbol?.metadata?.kicad_symbol?.properties?.Reference
          ?.value ?? getReferenceDesignator(source)
      for (const port of db.schematic_port.list()) {
        if (port.schematic_component_id !== component.schematic_component_id)
          continue
        const sourcePort = port.source_port_id
          ? db.source_port.get(port.source_port_id)
          : undefined
        if (!sourcePort) continue
        const number =
          getPhysicalPinName(sourcePort) ??
          String(port.pin_number ?? sourcePort.pin_number)
        const pin = pins.find((pin) => pin.numberString === number)
        if (!pin) continue
        // A '~' library name is displayed as an empty pin name by KiCad.
        const name = pin.name === "~" ? "" : (pin.name ?? "")
        getNet(sourcePort.source_port_id).pins.set(`${reference}.${number}`, {
          reference,
          number,
          name,
          repeatedName: pins.some(
            (other) => other.name === pin.name && other.numberString !== number,
          ),
        })
      }
    }

    for (const label of db.schematic_net_label.list()) {
      const id = label.source_trace_id || label.source_net_id
      if (!id) continue
      getNet(id).labels.push({
        name: normalizeNetName(label.text),
        priority: label.symbol_name ? 5 : 6,
      })
    }
    const path =
      sheet.schematicSheetId === null
        ? "/"
        : `/${normalizeNetName(sheet.sheetName)}/`
    for (const text of db.schematic_text.list()) {
      if (!text.source_trace_id || !db.source_trace.get(text.source_trace_id))
        continue
      getNet(text.source_trace_id).labels.push({
        name: `${path}${normalizeNetName(text.text)}`,
        priority: 4,
      })
    }
  }

  const resolved = new Map<string, string>()
  const automatic: { key: string; name: string }[] = []
  for (const [key, net] of nets) {
    if (net.labels.length) {
      net.labels.sort(
        (a, b) => b.priority - a.priority || compareNames(a.name, b.name),
      )
      resolved.set(key, net.labels[0]!.name)
    } else if (net.pins.size) {
      const names = [...net.pins.values()].map((pin) =>
        pinNetName(pin, net.pins.size === 1),
      )
      names.sort(compareNames)
      automatic.push({ key, name: names[0]! })
    }
  }

  // Explicit labels win when their names collide with an automatic name.
  const usedNames = new Set([
    ...resolved.values(),
    ...automatic.map(({ name }) => name),
  ])
  const assignedNames = new Set(resolved.values())
  for (const { key, name } of automatic) {
    let uniqueName = name
    if (assignedNames.has(name)) {
      let suffix = 1
      while (usedNames.has(`${name}_${suffix}`)) suffix++
      uniqueName = `${name}_${suffix}`
    }
    resolved.set(key, uniqueName)
    assignedNames.add(uniqueName)
    usedNames.add(uniqueName)
  }

  const result = new Map<string, string>()
  for (const element of circuitJson) {
    const id = getElementId(element)
    const name = resolved.get(connectivity.getNetConnectedToId(id) ?? id)
    if (name) result.set(id, name)
  }
  return result
}
