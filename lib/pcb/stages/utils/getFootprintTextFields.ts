import { getReferenceDesignator } from "../../../utils/getKicadCompatibleComponentName"

export interface FootprintTextFields {
  reference: string
  displayValue: string
}

/**
 * Get default footprint text fields from a source component.
 */
export function getFootprintTextFields(sourceComp: any): FootprintTextFields {
  const name = sourceComp.name || "?"
  const reference = getReferenceDesignator(sourceComp)

  if (sourceComp.ftype === "simple_resistor") {
    return {
      reference,
      displayValue: sourceComp.display_resistance || "R",
    }
  }

  if (sourceComp.ftype === "simple_capacitor") {
    return {
      reference,
      displayValue: sourceComp.display_capacitance || "C",
    }
  }

  if (sourceComp.ftype === "simple_inductor") {
    return {
      reference,
      displayValue: sourceComp.display_inductance || "L",
    }
  }

  if (sourceComp.ftype === "simple_diode") {
    return {
      reference,
      displayValue: "D",
    }
  }

  if (sourceComp.ftype === "simple_chip") {
    return {
      reference,
      displayValue: name,
    }
  }

  if (sourceComp.ftype === "simple_led") {
    return {
      reference,
      displayValue: sourceComp.manufacturer_part_number || "LED",
    }
  }

  if (sourceComp.ftype === "simple_switch") {
    return {
      reference,
      displayValue: sourceComp.manufacturer_part_number || "SW",
    }
  }

  if (sourceComp.ftype === "simple_potentiometer") {
    return {
      reference,
      displayValue: sourceComp.display_max_resistance || "POT",
    }
  }

  return {
    reference,
    displayValue: name,
  }
}
