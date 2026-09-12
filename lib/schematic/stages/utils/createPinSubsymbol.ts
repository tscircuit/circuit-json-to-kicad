import { createCircuitJsonTextFont } from "../../../utils/create-circuit-json-text-font"
import type { SchematicComponent, SchematicPort } from "circuit-json"
import {
  SchematicSymbol,
  SymbolPin,
  SymbolPinName,
  SymbolPinNumber,
  TextEffects,
} from "kicadts"
import { calculatePinPosition } from "./calculatePinPosition"

/**
 * Create the pin subsymbol for a KiCad library symbol
 */
export function createPinSubsymbol({
  libId,
  symbolData,
  isChip,
  schematicComponent,
  schematicPorts,
  c2kMatSchScale,
}: {
  libId: string
  symbolData: any
  isChip: boolean
  schematicComponent?: SchematicComponent
  schematicPorts: SchematicPort[]
  c2kMatSchScale: number
}): SchematicSymbol {
  const pinSymbol = new SchematicSymbol({
    libraryId: `${libId.split(":")[1]}_1_1`,
  })

  const CHIP_PIN_LENGTH = 6.0
  // Non-chip artwork already draws the visible lead up to each port.
  const CUSTOM_SYMBOL_PIN_LENGTH = 0.01

  for (let i = 0; i < (symbolData.ports?.length || 0); i++) {
    const port = symbolData.ports[i]
    const pin = new SymbolPin()
    pin.pinElectricalType = "passive"
    pin.pinGraphicStyle = "line"

    const { x, y, angle } = calculatePinPosition({
      port,
      center: symbolData.center,
      size: symbolData.size,
      isChip,
      portIndex: i,
      schematicComponent,
      schematicPorts,
      c2kMatSchScale,
    })
    pin.at = [x, y, angle]
    pin.length = isChip ? CHIP_PIN_LENGTH : CUSTOM_SYMBOL_PIN_LENGTH

    const pinName = port.labels?.[0] || "~"
    const nameFont = createCircuitJsonTextFont({
      text: pinName,
      font_size: 1.27,
    })
    const nameEffects = new TextEffects({ font: nameFont })
    pin._sxName = new SymbolPinName({ value: pinName, effects: nameEffects })

    const pinNum = port.pinNumber?.toString() || `${i + 1}`
    const numFont = createCircuitJsonTextFont({ text: pinNum, font_size: 1.27 })
    const numEffects = new TextEffects({ font: numFont })
    pin._sxNumber = new SymbolPinNumber({
      value: pinNum,
      effects: numEffects,
    })

    pinSymbol.pins.push(pin)
  }

  return pinSymbol
}
