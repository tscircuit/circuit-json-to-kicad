import { getReferenceDesignator } from "../../../utils/getKicadCompatibleComponentName"

export interface kicadComponentProperty {
  reference: string
  kicadComponentValue: string
}

/**
 * Get default footprint text fields from a source component.
 */
export function getkicadComponentProperty(
  sourceComp: any,
): kicadComponentProperty {
  const name = sourceComp.name || "?"
  const reference = getReferenceDesignator(sourceComp)

  if (sourceComp.ftype === "simple_resistor") {
    return {
      reference,
      kicadComponentValue: sourceComp.display_resistance || "R",
    }
  }

  if (sourceComp.ftype === "simple_capacitor") {
    return {
      reference,
      kicadComponentValue: sourceComp.display_capacitance || "C",
    }
  }

  if (sourceComp.ftype === "simple_inductor") {
    return {
      reference,
      kicadComponentValue: sourceComp.display_inductance || "L",
    }
  }

  if (sourceComp.ftype === "simple_diode") {
    return {
      reference,
      kicadComponentValue: "D",
    }
  }

  if (sourceComp.ftype === "simple_chip") {
    return {
      reference,
      kicadComponentValue: name,
    }
  }

  if (sourceComp.ftype === "simple_led") {
    return {
      reference,
      kicadComponentValue: sourceComp.manufacturer_part_number || "LED",
    }
  }

  if (sourceComp.ftype === "simple_switch") {
    return {
      reference,
      kicadComponentValue: sourceComp.manufacturer_part_number || "SW",
    }
  }

  if (sourceComp.ftype === "simple_potentiometer") {
    return {
      reference,
      kicadComponentValue: sourceComp.display_max_resistance || "POT",
    }
  }

  return {
    reference,
    kicadComponentValue: name,
  }
}
