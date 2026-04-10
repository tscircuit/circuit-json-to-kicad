import type { SourceComponentBase } from "circuit-json"
import { getReferenceDesignator } from "./getKicadCompatibleComponentName"

/**
 * Get component metadata (reference, value, description)
 */
export function getComponentMetadata(sourceComp: any): {
  reference: string
  value: string
  description: string
} {
  const name = sourceComp.name || "?"
  const reference = getReferenceDesignator(sourceComp)

  if (sourceComp.ftype === "simple_resistor") {
    return {
      reference,
      value: sourceComp.display_resistance || "R",
      description: "Resistor",
    }
  }

  if (sourceComp.ftype === "simple_capacitor") {
    return {
      reference,
      value: sourceComp.display_capacitance || "C",
      description: "Capacitor",
    }
  }

  if (sourceComp.ftype === "simple_inductor") {
    return {
      reference,
      value: sourceComp.display_inductance || "L",
      description: "Inductor",
    }
  }

  if (sourceComp.ftype === "simple_diode") {
    return {
      reference,
      value: "D",
      description: "Diode",
    }
  }

  if (sourceComp.ftype === "simple_chip") {
    return {
      reference,
      value: name,
      description: "Integrated Circuit",
    }
  }
  if (sourceComp.ftype === "simple_led") {
    return {
      reference,
      value: sourceComp.manufacturer_part_number || "LED",
      description: "LED",
    }
  }
  if (sourceComp.ftype === "simple_switch") {
    return {
      reference,
      value: sourceComp.manufacturer_part_number || "SW",
      description: "Switch",
    }
  }
  if (sourceComp.ftype === "simple_potentiometer") {
    return {
      reference,
      value: sourceComp.display_max_resistance || "RV",
      description: "Potentiometer",
    }
  }

  // Default
  return {
    reference,
    value: name,
    description: "Component",
  }
}

export function getComponentValue(
  sourceComp: SourceComponentBase | any,
): string {
  return getComponentMetadata(sourceComp).value
}
