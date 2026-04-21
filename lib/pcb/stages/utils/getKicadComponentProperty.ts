import type {
  SourceComponentBase,
  SourceSimpleCapacitor,
  SourceSimpleInductor,
  SourceSimplePotentiometer,
  SourceSimpleResistor,
} from "circuit-json"
import { getReferenceDesignator } from "../../../utils/getKicadCompatibleComponentName"

export interface kicadComponentProperty {
  reference: string
  kicadComponentValue?: string
}

/**
 * Get default footprint text fields from a source component.
 */
export function getkicadComponentProperty(
  sourceComp: SourceComponentBase,
): kicadComponentProperty {
  const name = sourceComp.name || "?"
  const reference = getReferenceDesignator(sourceComp)

  if (sourceComp.ftype === "simple_resistor") {
    const resistor = sourceComp as SourceSimpleResistor
    return {
      reference,
      kicadComponentValue: resistor.display_resistance || "R",
    }
  }

  if (sourceComp.ftype === "simple_capacitor") {
    const capacitor = sourceComp as SourceSimpleCapacitor
    return {
      reference,
      kicadComponentValue: capacitor.display_capacitance || "C",
    }
  }

  if (sourceComp.ftype === "simple_inductor") {
    const inductor = sourceComp as SourceSimpleInductor
    return {
      reference,
      kicadComponentValue: inductor.display_inductance || "L",
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
      kicadComponentValue: sourceComp?.manufacturer_part_number,
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
    const potentiometer = sourceComp as SourceSimplePotentiometer
    return {
      reference,
      kicadComponentValue: potentiometer.display_max_resistance || "POT",
    }
  }

  return {
    reference,
    kicadComponentValue: name,
  }
}
