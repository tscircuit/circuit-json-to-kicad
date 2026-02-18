import type { SchematicComponent, SchematicPort } from "circuit-json"
import {
  SchematicSymbol,
  SymbolPin,
  SymbolPinName,
  SymbolPinNumber,
  TextEffects,
  TextEffectsFont,
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
  const CUSTOM_SYMBOL_PIN_LENGTH = 2.54 // 0.1 inch

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

    const nameFont = new TextEffectsFont()
    nameFont.size = { height: 1.27, width: 1.27 }
    const nameEffects = new TextEffects({ font: nameFont })
    const pinName = port.labels?.[0] || "~"
    pin._sxName = new SymbolPinName({ value: pinName, effects: nameEffects })

    const numFont = new TextEffectsFont()
    numFont.size = { height: 1.27, width: 1.27 }
    const numEffects = new TextEffects({ font: numFont })
    const pinNum = port.pinNumber?.toString() || `${i + 1}`
    pin._sxNumber = new SymbolPinNumber({
      value: pinNum,
      effects: numEffects,
    })

    pinSymbol.pins.push(pin)
  }

  return pinSymbol
}
