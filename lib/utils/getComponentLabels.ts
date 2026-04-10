import { getReferenceDesignator } from "./getKicadCompatibleComponentName"

export interface ComponentLabels {
  reference: string
  label: string
  description: string
}

/**
 * Get component labels (reference designator and display label)
 */
export function getComponentLabels(sourceComp: any): ComponentLabels {
  const name = sourceComp.name || "?"
  const reference = getReferenceDesignator(sourceComp)

  if (sourceComp.ftype === "simple_resistor") {
    return {
      reference,
      label: sourceComp.display_resistance || "R",
      description: "Resistor",
    }
  }

  if (sourceComp.ftype === "simple_capacitor") {
    return {
      reference,
      label: sourceComp.display_capacitance || "C",
      description: "Capacitor",
    }
  }

  if (sourceComp.ftype === "simple_inductor") {
    return {
      reference,
      label: sourceComp.display_inductance || "L",
      description: "Inductor",
    }
  }

  if (sourceComp.ftype === "simple_diode") {
    return {
      reference,
      label: "D",
      description: "Diode",
    }
  }

  if (sourceComp.ftype === "simple_chip") {
    return {
      reference,
      label: name,
      description: "Integrated Circuit",
    }
  }

  if (sourceComp.ftype === "simple_led") {
    return {
      reference,
      label: sourceComp.manufacturer_part_number || "LED",
      description: "LED",
    }
  }

  if (sourceComp.ftype === "simple_switch") {
    return {
      reference,
      label: sourceComp.manufacturer_part_number || "SW",
      description: "Switch",
    }
  }

  if (sourceComp.ftype === "simple_potentiometer") {
    return {
      reference,
      label: sourceComp.display_max_resistance || "POT",
      description: "Potentiometer",
    }
  }

  // Default
  return {
    reference,
    label: name,
    description: "Component",
  }
}
