import type { SourceComponentBase } from "circuit-json"

/**
 * Extracts a human-readable value string from a source component.
 * e.g., "1kΩ" for resistors, "1uF" for capacitors, etc.
 */
export function getComponentValue(
  sourceComp: SourceComponentBase | any,
): string {
  const name = sourceComp.name || "?"

  if (sourceComp.ftype === "simple_resistor") {
    return sourceComp.display_resistance || "R"
  }

  if (sourceComp.ftype === "simple_capacitor") {
    return sourceComp.display_capacitance || "C"
  }

  if (sourceComp.ftype === "simple_inductor") {
    return sourceComp.display_inductance || "L"
  }

  if (sourceComp.ftype === "simple_diode") {
    return "D"
  }

  if (sourceComp.ftype === "simple_chip") {
    return name
  }

  if (sourceComp.ftype === "simple_led") {
    return sourceComp.manufacturer_part_number || "LED"
  }

  if (sourceComp.ftype === "simple_switch") {
    return sourceComp.manufacturer_part_number || "SW"
  }

  if (sourceComp.ftype === "simple_potentiometer") {
    return sourceComp.display_max_resistance || "RV"
  }

  // Default to component name
  return name
}
