import { createBoardOwnerMap } from "@tscircuit/circuit-json-util"
import type { CircuitJson } from "circuit-json"
import { resolveKicadPcbNetName } from "../pcb/utils/resolveKicadPcbNetName"
import type { KicadProNetClass } from "./CircuitJsonToKicadProConverter"

/** KiCad 9+ explicit assignments avoid interpreting net names as patterns. */
export function getNamedNetClassSettings({
  circuitJson,
  defaultNetClass,
}: {
  circuitJson: CircuitJson
  defaultNetClass: KicadProNetClass
}) {
  const sourceNetClasses = circuitJson.filter(
    (element) => element.type === "source_net_class",
  )
  if (sourceNetClasses.length === 0) {
    if (
      circuitJson.some(
        (element) =>
          element.type === "source_net" && element.source_net_class_ids?.length,
      )
    ) {
      throw new Error(
        "Cannot export net class assignments without class definitions",
      )
    }
    return undefined
  }
  const sourceNetClassesById = new Map(
    sourceNetClasses.map((netClass) => [
      netClass.source_net_class_id,
      netClass,
    ]),
  )
  const classesByName = new Map<string, KicadProNetClass>()
  classesByName.set("Default", { ...defaultNetClass, priority: 2147483647 })
  const definedNames = new Set<string>()
  for (const sourceNetClass of sourceNetClasses) {
    const netClass: KicadProNetClass = {
      name: sourceNetClass.name,
      track_width: sourceNetClass.trace_width,
      priority: sourceNetClass.priority ?? 0,
    }
    if (netClass.name === "Default") {
      Object.assign(netClass, {
        ...defaultNetClass,
        ...netClass,
        track_width: sourceNetClass.trace_width ?? defaultNetClass.track_width,
        priority: 2147483647,
      })
    }
    const existing = classesByName.get(sourceNetClass.name)
    if (
      definedNames.has(sourceNetClass.name) &&
      JSON.stringify(existing) !== JSON.stringify(netClass)
    ) {
      throw new Error(
        `Cannot preserve conflicting definitions for KiCad net class "${sourceNetClass.name}"`,
      )
    }
    classesByName.set(sourceNetClass.name, netClass)
    definedNames.add(sourceNetClass.name)
  }

  const boardOwnerMap =
    circuitJson.filter((element) => element.type === "pcb_board").length > 1
      ? createBoardOwnerMap(circuitJson)
      : undefined
  const assignments: Record<string, string[]> = Object.create(null)
  const sourceNets = circuitJson.filter(
    (element) => element.type === "source_net",
  )
  const netOverrides: Array<{ netName: string; width: number }> = []
  const effectiveWidthsByNetName = new Map<string, number | undefined>()
  for (const sourceNet of sourceNets) {
    const netName = resolveKicadPcbNetName({
      candidateName: sourceNet.name || sourceNet.source_net_id,
      connectivityKey:
        sourceNet.subcircuit_connectivity_map_key || sourceNet.source_net_id,
      boardId: boardOwnerMap?.get(sourceNet.subcircuit_id ?? "")?.pcb_board_id,
    })
    const assignedClasses = (sourceNet.source_net_class_ids ?? []).map((id) => {
      const netClass = sourceNetClassesById.get(id)
      if (!netClass)
        throw new Error(`Net "${sourceNet.name}" refers to a missing net class`)
      return netClass
    })
    const orderedClasses = [...assignedClasses].sort((a, b) => {
      if (a.name === "Default") return 1
      if (b.name === "Default") return -1
      const priorityDifference = (a.priority ?? 0) - (b.priority ?? 0)
      if (priorityDifference !== 0) return priorityDifference
      if (a.name < b.name) return -1
      if (a.name > b.name) return 1
      return 0
    })
    if (
      assignedClasses.some(
        (netClass, index) => netClass !== orderedClasses[index],
      )
    ) {
      throw new Error(
        `Net "${sourceNet.name}" has a class order that conflicts with KiCad priorities`,
      )
    }
    const names = Array.from(
      new Set(assignedClasses.map((netClass) => netClass.name)),
    )
    const existing = assignments[netName]
    if (existing && JSON.stringify(existing) !== JSON.stringify(names)) {
      throw new Error(
        `Cannot preserve conflicting net class assignments for KiCad net "${netName}"`,
      )
    }
    assignments[netName] = names
    const classWidth =
      assignedClasses.find((netClass) => netClass.trace_width !== undefined)
        ?.trace_width ?? classesByName.get("Default")?.track_width
    const effectiveWidth = sourceNet.trace_width ?? classWidth
    if (
      effectiveWidthsByNetName.has(netName) &&
      effectiveWidthsByNetName.get(netName) !== effectiveWidth
    ) {
      throw new Error(
        `Cannot preserve conflicting trace widths for KiCad net "${netName}"`,
      )
    }
    effectiveWidthsByNetName.set(netName, effectiveWidth)
    if (
      sourceNet.trace_width !== undefined &&
      sourceNet.trace_width !== classWidth
    ) {
      netOverrides.push({ netName, width: sourceNet.trace_width })
    }
  }

  // An explicit per-net width must win over the named classes without deleting
  // those memberships. Reserve priority zero for generated override classes,
  // shifting authored priorities only when necessary to keep their ordering.
  if (netOverrides.length > 0) {
    for (const [name, netClass] of classesByName) {
      if (name !== "Default") netClass.priority = (netClass.priority ?? 0) + 1
    }
    const overrideNames = new Map<number, string>()
    for (const { netName, width } of netOverrides.sort(
      (a, b) => a.width - b.width || a.netName.localeCompare(b.netName),
    )) {
      let name = overrideNames.get(width)
      if (!name) {
        const baseName = `Trace Width ${width} mm`
        name = baseName
        let suffix = 2
        while (classesByName.has(name)) name = `${baseName} (${suffix++})`
        classesByName.set(name, { name, track_width: width, priority: 0 })
        overrideNames.set(width, name)
      }
      assignments[netName] = Array.from(
        new Set([name, ...assignments[netName]!]),
      )
    }
  }

  return {
    meta: { version: 4 },
    classes: Array.from(classesByName.values()).sort((a, b) => {
      if (a.name === "Default") return -1
      if (b.name === "Default") return 1
      return a.name!.localeCompare(b.name!)
    }),
    netclass_patterns: [],
    netclass_assignments: Object.fromEntries(
      Object.entries(assignments).sort(([a], [b]) => a.localeCompare(b)),
    ),
  }
}
