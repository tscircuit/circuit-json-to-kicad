import type {
  Point,
  SchematicComponent,
  SchematicPath,
  SchematicPort,
  Size,
} from "circuit-json"
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

type ImportedSymbol = {
  center?: Point
  size?: Size
  ports?: any[]
  primitives?: Array<Pick<SchematicPath, "type" | "points">>
}

function pointMatches(a: Point, b: Point): boolean {
  const tolerance = 1e-4
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance
}

function symbolHasDecorativeLeadStubs(symbolData: ImportedSymbol): boolean {
  const ports = symbolData.ports ?? []
  const primitives = symbolData.primitives ?? []

  if (ports.length === 0) return false
  if (primitives.length === 0) return false

  for (const port of ports) {
    let portHasLeadStub = false

    for (const primitive of primitives) {
      if (primitive.type !== "path") continue
      if (!primitive.points) continue
      if (primitive.points.length !== 2) continue

      const start = primitive.points[0]
      const end = primitive.points[1]
      if (!start || !end) continue

      if (pointMatches(start, port) || pointMatches(end, port)) {
        portHasLeadStub = true
        break
      }
    }

    if (!portHasLeadStub) {
      return false
    }
  }

  return true
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
  symbolData: ImportedSymbol
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
  let customPinLength = CUSTOM_SYMBOL_PIN_LENGTH
  if (symbolHasDecorativeLeadStubs(symbolData)) {
    customPinLength = MINIMAL_DECORATIVE_PIN_LENGTH
  }

  const ports = symbolData.ports ?? []
  for (let i = 0; i < ports.length; i++) {
    const port = ports[i]
    if (!port) continue
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
    pin.length = customPinLength
    if (isChip) {
      pin.length = CHIP_PIN_LENGTH
    }

    const nameFont = new TextEffectsFont()
    nameFont.size = { height: 1.27, width: 1.27 }
    const nameEffects = new TextEffects({ font: nameFont })
    // Imported passive symbols sometimes omit a visible pin label. In that case
    // we leave the KiCad pin-name field unset instead of inventing one.
    if (port.labels?.[0]) {
      pin._sxName = new SymbolPinName({
        value: port.labels[0],
        effects: nameEffects,
      })
    }

    const numFont = new TextEffectsFont()
    numFont.size = { height: 1.27, width: 1.27 }
    const numEffects = new TextEffects({ font: numFont })
    let pinNum = `${i + 1}`
    if (port.pinNumber != null) {
      pinNum = port.pinNumber.toString()
    }
    pin._sxNumber = new SymbolPinNumber({
      value: pinNum,
      effects: numEffects,
    })

    pinSymbol.pins.push(pin)
  }

  return pinSymbol
}
