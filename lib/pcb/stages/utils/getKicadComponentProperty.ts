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
  manufacturerPartNumber?: string
}

function getJlcpcbSupplierPartNumber(
  sourceComp: SourceComponentBase,
): string | undefined {
  const jlcpcbPartNumbers = sourceComp.supplier_part_numbers?.jlcpcb

  return jlcpcbPartNumbers && jlcpcbPartNumbers.length > 0
    ? jlcpcbPartNumbers.join(", ")
    : undefined
}

/**
 * Get default footprint text fields from a source component.
 */
export function getkicadComponentProperty(
  sourceComp: SourceComponentBase,
): kicadComponentProperty {
  const name = sourceComp.name || "?"
  const reference = getReferenceDesignator(sourceComp)
  const supplierPartNumber = getJlcpcbSupplierPartNumber(sourceComp)
  const manufacturerPartNumber = sourceComp.manufacturer_part_number

  if (sourceComp.ftype === "simple_resistor") {
    const resistor = sourceComp as SourceSimpleResistor
    return {
      reference,
      kicadComponentValue: resistor.display_resistance || "R",
      supplierPartNumber,
      manufacturerPartNumber,
    }
  }

  if (sourceComp.ftype === "simple_capacitor") {
    const capacitor = sourceComp as SourceSimpleCapacitor
    return {
      reference,
      kicadComponentValue: capacitor.display_capacitance || "C",
      supplierPartNumber,
      manufacturerPartNumber,
    }
  }

  if (sourceComp.ftype === "simple_inductor") {
    const inductor = sourceComp as SourceSimpleInductor
    return {
      reference,
      kicadComponentValue: inductor.display_inductance || "L",
      supplierPartNumber,
      manufacturerPartNumber,
    }
  }

  if (sourceComp.ftype === "simple_diode") {
    return {
      reference,
      kicadComponentValue: "D",
      supplierPartNumber,
      manufacturerPartNumber,
    }
  }

  if (sourceComp.ftype === "simple_chip") {
    return {
      reference,
      kicadComponentValue: sourceComp?.manufacturer_part_number,
      supplierPartNumber,
      manufacturerPartNumber,
    }
  }

  if (sourceComp.ftype === "simple_led") {
    return {
      reference,
      kicadComponentValue: sourceComp.manufacturer_part_number || "LED",
      supplierPartNumber,
      manufacturerPartNumber,
    }
  }

  if (sourceComp.ftype === "simple_switch") {
    return {
      reference,
      kicadComponentValue: sourceComp.manufacturer_part_number || "SW",
      supplierPartNumber,
      manufacturerPartNumber,
    }
  }

  if (sourceComp.ftype === "simple_potentiometer") {
    const potentiometer = sourceComp as SourceSimplePotentiometer
    return {
      reference,
      kicadComponentValue: potentiometer.display_max_resistance || "POT",
      supplierPartNumber,
      manufacturerPartNumber,
    }
  }

  return {
    reference,
    kicadComponentValue: name,
    supplierPartNumber,
    manufacturerPartNumber,
  }
}
