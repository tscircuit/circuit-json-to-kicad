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

const MINIMAL_DECORATIVE_PIN_LENGTH = 0.01

function symbolHasDecorativeLeadStubs(symbolData: any): boolean {
  const ports = Array.isArray(symbolData?.ports) ? symbolData.ports : []
  const primitives = Array.isArray(symbolData?.primitives)
    ? symbolData.primitives
    : []

  if (ports.length === 0 || primitives.length === 0) return false

  const tolerance = 1e-4
  const pointMatches = (
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance

  return ports.every((port: any) =>
    primitives.some((primitive: any) => {
      if (primitive.type !== "path" || !Array.isArray(primitive.points)) {
        return false
      }
      if (primitive.points.length !== 2) return false

      const [start, end] = primitive.points
      return pointMatches(start, port) || pointMatches(end, port)
    }),
  )
}

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
  const customPinLength = symbolHasDecorativeLeadStubs(symbolData)
    ? MINIMAL_DECORATIVE_PIN_LENGTH
    : CUSTOM_SYMBOL_PIN_LENGTH

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
    pin.length = isChip ? CHIP_PIN_LENGTH : customPinLength

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
