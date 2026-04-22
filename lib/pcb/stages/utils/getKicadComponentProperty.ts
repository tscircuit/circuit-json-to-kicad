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
  supplierPartNumber?: string
}

/**
 * Get default footprint text fields from a source component.
 */
export function getkicadComponentProperty(
  sourceComp: SourceComponentBase,
): kicadComponentProperty {
  const name = sourceComp.name || "?"
  const reference = getReferenceDesignator(sourceComp)
  const supplierPartNumberCandidate = (
    sourceComp as {
      supplier_part_numbers?: Record<string, string | string[] | undefined>
    }
  ).supplier_part_numbers
  const supplierPartNumberRaw =
    supplierPartNumberCandidate?.lcsc || supplierPartNumberCandidate?.jlcpcb
  const supplierPartNumber = Array.isArray(supplierPartNumberRaw)
    ? supplierPartNumberRaw.join(", ")
    : supplierPartNumberRaw

  if (sourceComp.ftype === "simple_resistor") {
    const resistor = sourceComp as SourceSimpleResistor
    return {
      reference,
      kicadComponentValue: resistor.display_resistance || "R",
      supplierPartNumber,
    }
  }

  if (sourceComp.ftype === "simple_capacitor") {
    const capacitor = sourceComp as SourceSimpleCapacitor
    return {
      reference,
      kicadComponentValue: capacitor.display_capacitance || "C",
      supplierPartNumber,
    }
  }

  if (sourceComp.ftype === "simple_inductor") {
    const inductor = sourceComp as SourceSimpleInductor
    return {
      reference,
      kicadComponentValue: inductor.display_inductance || "L",
      supplierPartNumber,
    }
  }

  if (sourceComp.ftype === "simple_diode") {
    return {
      reference,
      kicadComponentValue: "D",
      supplierPartNumber,
    }
  }

  if (sourceComp.ftype === "simple_chip") {
    return {
      reference,
      kicadComponentValue: sourceComp?.manufacturer_part_number,
      supplierPartNumber,
    }
  }

  if (sourceComp.ftype === "simple_led") {
    return {
      reference,
      kicadComponentValue: sourceComp.manufacturer_part_number || "LED",
      supplierPartNumber,
    }
  }

  if (sourceComp.ftype === "simple_switch") {
    return {
      reference,
      kicadComponentValue: sourceComp.manufacturer_part_number || "SW",
      supplierPartNumber,
    }
  }

  if (sourceComp.ftype === "simple_potentiometer") {
    const potentiometer = sourceComp as SourceSimplePotentiometer
    return {
      reference,
      kicadComponentValue: potentiometer.display_max_resistance || "POT",
      supplierPartNumber,
    }
  }

  return {
    reference,
    kicadComponentValue: name,
    supplierPartNumber,
  }
}
