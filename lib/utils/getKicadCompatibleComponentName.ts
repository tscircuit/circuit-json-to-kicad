import type {
  CircuitJson,
  PcbComponent,
  SourceComponentBase,
  CadComponent,
} from "circuit-json"

/**
 * Generates an ergonomic component name for use in KiCad symbols and footprints.
 *
 * Priority:
 * 1. manufacturer_part_number (BEST) - e.g., "NA555", "ATmega328P"
 * 2. {clean_type}_{footprinter_string} (OK) - e.g., "resistor_0402", "chip_soic8"
 * 3. {clean_type} (LAST RESORT) - e.g., "resistor", "capacitor", "chip"
 *
 * Never uses:
 * - Reference designators (R1, U1, C1)
 * - "simple_" prefix
 * - source_component_id
 */
export function getKicadCompatibleComponentName(
  sourceComponent: SourceComponentBase,
  cadComponent?: CadComponent | null,
): string {
  // Priority 1: Use manufacturer part number if available
  if (sourceComponent.manufacturer_part_number) {
    return sanitizeName(sourceComponent.manufacturer_part_number)
  }

  // Get clean type name (strip "simple_" prefix)
  const cleanType = getCleanTypeName(sourceComponent.ftype)

  // Priority 2: Use type + footprinter string if available
  const footprinterString = cadComponent?.footprinter_string
  if (footprinterString) {
    return sanitizeName(`${cleanType}_${footprinterString}`)
  }

  // Priority 3: Use clean type name only
  return sanitizeName(cleanType)
}

/**
 * Returns a stable library name for a custom schematic symbol.
 *
 * A generic component type such as `chip` is not enough to identify custom
 * artwork: two anonymous `<symbol>` definitions can have entirely different
 * bodies. Prefer reusable part metadata when it exists, otherwise include the
 * schematic symbol id so each anonymous definition retains its own artwork.
 */
export function getKicadCompatibleCustomSymbolName(
  sourceComponent: SourceComponentBase,
  cadComponent: CadComponent | null | undefined,
  schematicSymbolId: string,
): string {
  if (
    sourceComponent.manufacturer_part_number ||
    cadComponent?.footprinter_string
  ) {
    return getKicadCompatibleComponentName(sourceComponent, cadComponent)
  }

  return sanitizeName(
    `custom_${getCleanTypeName(sourceComponent.ftype)}_${schematicSymbolId}`,
  )
}

function roundCoord(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

function toFootprintLocalPoint(
  point: { x: number; y: number },
  origin: { x: number; y: number },
  rotationDeg: number,
): { x: number; y: number } {
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  if (rotationDeg === 0) {
    return { x: roundCoord(dx), y: roundCoord(dy) }
  }
  const rad = (-rotationDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    x: roundCoord(dx * cos - dy * sin),
    y: roundCoord(dx * sin + dy * cos),
  }
}

function getFootprintGeometrySignature(
  circuitJson: CircuitJson,
  pcbComponent: PcbComponent,
  sourceComponent: SourceComponentBase,
  cadComponent?: CadComponent | null,
): string {
  const origin = (
    pcbComponent as { footprint_origin?: { x: number; y: number } }
  ).footprint_origin ??
    pcbComponent.center ?? { x: 0, y: 0 }
  const rotation = pcbComponent.rotation ?? 0

  const omittedKeys = new Set([
    "pcb_component_id",
    "pcb_port_id",
    "source_component_id",
    "subcircuit_id",
    "pcb_group_id",
    "pcb_smtpad_id",
    "pcb_plated_hole_id",
    "pcb_hole_id",
    "pcb_silkscreen_text_id",
    "pcb_silkscreen_path_id",
    "pcb_silkscreen_rect_id",
    "pcb_silkscreen_circle_id",
    "pcb_fabrication_note_path_id",
    "pcb_fabrication_note_rect_id",
    "pcb_fabrication_note_text_id",
    "pcb_courtyard_rect_id",
    "pcb_courtyard_outline_id",
    "pcb_courtyard_circle_id",
    "pcb_note_rect_id",
    "pcb_note_text_id",
    "pcb_solder_paste_id",
    "pcb_copper_text_id",
    "port_hints",
  ])

  const primitiveSignatures: string[] = []
  for (const el of circuitJson) {
    if (
      !("pcb_component_id" in el) ||
      el.pcb_component_id !== pcbComponent.pcb_component_id ||
      el.type === "pcb_component" ||
      el.type === "pcb_port"
    ) {
      continue
    }

    const record: Record<string, unknown> = {}
    for (const key of Object.keys(el).sort()) {
      if (omittedKeys.has(key)) continue
      const val = (el as Record<string, unknown>)[key]
      if (val === undefined) continue
      if (
        (key === "center" || key === "anchor_position") &&
        val &&
        typeof val === "object" &&
        "x" in val &&
        "y" in val
      ) {
        record[key] = toFootprintLocalPoint(
          val as { x: number; y: number },
          origin,
          rotation,
        )
      } else if (
        (key === "route" ||
          key === "outline" ||
          key === "points" ||
          key === "pad_outline") &&
        Array.isArray(val)
      ) {
        record[key] = val.map((pt) =>
          pt && typeof pt === "object" && "x" in pt && "y" in pt
            ? {
                ...pt,
                ...toFootprintLocalPoint(
                  pt as { x: number; y: number },
                  origin,
                  rotation,
                ),
              }
            : pt,
        )
      } else if (
        key === "text" &&
        sourceComponent.name &&
        val === sourceComponent.name
      ) {
        record[key] = "{REF}"
      } else {
        record[key] = val
      }
    }

    if (
      "x" in el &&
      "y" in el &&
      typeof el.x === "number" &&
      typeof el.y === "number"
    ) {
      const rel = toFootprintLocalPoint({ x: el.x, y: el.y }, origin, rotation)
      record.x = rel.x
      record.y = rel.y
    }

    primitiveSignatures.push(JSON.stringify(record))
  }

  primitiveSignatures.sort()

  const modelSignature = cadComponent
    ? [
        cadComponent.model_step_url,
        cadComponent.model_stl_url,
        cadComponent.model_obj_url,
        cadComponent.model_gltf_url,
        cadComponent.model_wrl_url,
      ]
        .filter(Boolean)
        .join("|")
    : ""

  if (primitiveSignatures.length === 0 && !modelSignature) {
    return `empty:${roundCoord(pcbComponent.width ?? 0)}x${roundCoord(pcbComponent.height ?? 0)}`
  }

  return `${primitiveSignatures.join(";")}|${modelSignature}`
}

/**
 * Returns a consistent KiCad footprint name for a component across schematic
 * symbol references, placed PCB footprints, and extracted footprint libraries.
 *
 * When multiple anonymous inline footprints share the same fallback base name
 * (e.g., two `<chip>` components with different inline `<footprint>` geometries
 * and no `manufacturer_part_number` or `footprinter_string`), distinct footprint
 * geometries receive disambiguated names (`chip`, `chip_2`, ...).
 */
export function getKicadCompatibleFootprintName(
  circuitJson: CircuitJson,
  sourceComponent: SourceComponentBase,
  cadComponent?: CadComponent | null,
): string {
  const baseName = getKicadCompatibleComponentName(
    sourceComponent,
    cadComponent,
  )
  if (
    sourceComponent.manufacturer_part_number ||
    cadComponent?.footprinter_string
  ) {
    return baseName
  }

  const pcbComponents = circuitJson.filter(
    (el): el is PcbComponent => el.type === "pcb_component",
  )
  const pcbComponent = pcbComponents.find(
    (el) => el.source_component_id === sourceComponent.source_component_id,
  )
  if (!pcbComponent) {
    return baseName
  }

  if (pcbComponent.metadata?.kicad_footprint?.footprintName) {
    return (
      pcbComponent.metadata.kicad_footprint.footprintName.split(":").pop() ||
      baseName
    )
  }

  const sourceComponents = circuitJson.filter(
    (el): el is Extract<CircuitJson[number], { type: "source_component" }> =>
      el.type === "source_component",
  ) as SourceComponentBase[]
  const cadComponents = circuitJson.filter(
    (el): el is CadComponent => el.type === "cad_component",
  )

  const reservedNames = new Set<string>()
  for (const sc of sourceComponents) {
    const cad = cadComponents.find(
      (c) => c.source_component_id === sc.source_component_id,
    )
    reservedNames.add(getKicadCompatibleComponentName(sc, cad))
  }
  for (const pc of pcbComponents) {
    const metaName = pc.metadata?.kicad_footprint?.footprintName
      ?.split(":")
      .pop()
    if (metaName) reservedNames.add(metaName)
  }

  const nameBySignature = new Map<string, string>()
  const usedNames = new Set<string>()
  let suffix = 2

  for (const candidatePcb of pcbComponents) {
    if (!candidatePcb.source_component_id) continue
    if (candidatePcb.metadata?.kicad_footprint?.footprintName) continue

    const candidateSource = sourceComponents.find(
      (sc) => sc.source_component_id === candidatePcb.source_component_id,
    )
    if (!candidateSource) continue

    const candidateCad = cadComponents.find(
      (c) =>
        c.pcb_component_id === candidatePcb.pcb_component_id ||
        c.source_component_id === candidatePcb.source_component_id,
    )
    if (
      candidateSource.manufacturer_part_number ||
      candidateCad?.footprinter_string
    ) {
      continue
    }

    const candidateBase = getKicadCompatibleComponentName(
      candidateSource,
      candidateCad,
    )
    if (candidateBase !== baseName) continue

    const signature = getFootprintGeometrySignature(
      circuitJson,
      candidatePcb,
      candidateSource,
      candidateCad,
    )
    let resolvedName = nameBySignature.get(signature)
    if (!resolvedName) {
      if (!usedNames.has(baseName)) {
        resolvedName = baseName
      } else {
        do {
          resolvedName = `${baseName}_${suffix++}`
        } while (reservedNames.has(resolvedName) || usedNames.has(resolvedName))
      }
      nameBySignature.set(signature, resolvedName)
      usedNames.add(resolvedName)
    }

    if (candidatePcb.pcb_component_id === pcbComponent.pcb_component_id) {
      return resolvedName
    }
  }

  return baseName
}

/**
 * Clean up the ftype by removing "simple_" prefix
 */
function getCleanTypeName(ftype?: string): string {
  if (!ftype) return "component"

  // Remove "simple_" prefix
  let cleanName = ftype.replace(/^simple_/, "")

  // Handle empty result
  if (!cleanName) return "component"

  return cleanName
}

/**
 * Sanitize a name for use in KiCad
 * - Replace invalid characters with underscores
 * - Trim whitespace
 */
function sanitizeName(name: string): string {
  return (
    name
      .replace(/[^A-Za-z0-9_-]+/g, "_") // Replace invalid chars with underscore
      .replace(/_+/g, "_") // Collapse multiple underscores
      .replace(/^_|_$/g, "") // Trim leading/trailing underscores
      .trim() || "component"
  )
}

/**
 * Extracts the reference prefix from a component's name (reference designator)
 * e.g., "R1" -> "R", "U23" -> "U", "C5" -> "C"
 */
export function extractReferencePrefix(name?: string): string {
  if (!name) return "U"
  // Extract leading letters from the reference designator
  const match = name.match(/^([A-Za-z]+)/)
  return match?.[1]?.toUpperCase() ?? "U"
}

const referencePrefixByFtype: Record<string, string> = {
  simple_resistor: "R",
  simple_capacitor: "C",
  simple_inductor: "L",
  simple_diode: "D",
  simple_led: "D",
  simple_chip: "U",
  simple_transistor: "Q",
  simple_mosfet: "Q",
  simple_fuse: "F",
  simple_switch: "SW",
  simple_push_button: "SW",
  simple_potentiometer: "RV",
  simple_crystal: "Y",
  simple_resonator: "Y",
  simple_pin_header: "J",
  simple_pinout: "J",
  simple_test_point: "TP",
  simple_battery: "BT",
}

const referenceDesignatorPattern = /^[A-Za-z]+\d+$/

export function isReferenceDesignator(value?: string | null): boolean {
  if (!value) return false
  return referenceDesignatorPattern.test(value.trim())
}

export function getReferencePrefixForComponent(
  sourceComponent?: SourceComponentBase | null,
): string {
  // Priority 1: Use ftype mapping (most reliable indicator of component type)
  const ftype = sourceComponent?.ftype
  if (ftype && referencePrefixByFtype[ftype]) {
    return referencePrefixByFtype[ftype]
  }

  // Priority 2: Extract from name if it looks like a reference designator
  const name = sourceComponent?.name
  if (isReferenceDesignator(name)) {
    return extractReferencePrefix(name)
  }

  // Priority 3: Extract leading letters from name, or default to "U"
  return extractReferencePrefix(name)
}

export function getReferenceDesignator(
  sourceComponent?: SourceComponentBase | null,
): string {
  const name = sourceComponent?.name
  const trimmedName = name?.trim()
  if (trimmedName) {
    return trimmedName
  }

  const prefix = getReferencePrefixForComponent(sourceComponent)
  return `${prefix}?`
}
