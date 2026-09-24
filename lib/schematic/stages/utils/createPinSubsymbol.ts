import type { SchematicComponent, SchematicPort } from "circuit-json"
import {
  SchematicSymbol,
  SymbolPin,
  SymbolPinName,
  SymbolPinNumber,
  TextEffects,
  TextEffectsFont,
} from "kicadts"
import type { SchSymbol } from "schematic-symbols"
import { calculatePinPosition } from "./calculatePinPosition"

type PortSide = "left" | "right" | "up" | "down"
type SymbolPort = SchSymbol["ports"][number] & {
  pinNumber?: string | number
}
type SymbolData = Omit<SchSymbol, "ports"> & { ports: SymbolPort[] }
type PositionedPort = { x: number; y: number }
type PositionedSymbolPort = PositionedPort & { index: number }
type PositionedCircuitPort = PositionedPort & { port: SchematicPort }

function getPortSide(x: number, y: number): PortSide {
  if (Math.abs(x) > Math.abs(y)) return x < 0 ? "left" : "right"
  return y < 0 ? "down" : "up"
}

function hasDuplicatePositions(values: number[]): boolean {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.some((value, index) => {
    const previous = sorted[index - 1]
    return previous !== undefined && Math.abs(value - previous) < 1e-6
  })
}

/**
 * Match symbol artwork ports to the circuit ports drawn on the same side.
 * Stem lengths can differ, so compare ordering along each side rather than
 * requiring the coordinates to be equal.
 */
function getCircuitPinNumbers({
  symbolData,
  schematicComponent,
  schematicPorts,
}: {
  symbolData: SymbolData
  schematicComponent?: SchematicComponent
  schematicPorts: SchematicPort[]
}): Map<number, string> {
  const matches = new Map<number, string>()
  if (!schematicComponent) return matches

  const symbolCenter = symbolData.center ?? { x: 0, y: 0 }
  const componentPorts = schematicPorts.filter(
    (port) =>
      port.schematic_component_id === schematicComponent.schematic_component_id,
  )

  for (const side of ["left", "right", "up", "down"] as const) {
    const symbolPorts: PositionedSymbolPort[] = symbolData.ports
      .map((port, index) => ({
        index,
        x: (port.x ?? 0) - symbolCenter.x,
        y: (port.y ?? 0) - symbolCenter.y,
      }))
      .filter(
        (port: { x: number; y: number }) =>
          getPortSide(port.x, port.y) === side,
      )
    const circuitPorts: PositionedCircuitPort[] = componentPorts
      .map((port) => ({
        port,
        x: port.center.x - schematicComponent.center.x,
        y: port.center.y - schematicComponent.center.y,
      }))
      .filter(
        ({ port, x, y }) =>
          (port.facing_direction ?? getPortSide(x, y)) === side,
      )

    if (
      symbolPorts.length === 0 ||
      symbolPorts.length !== circuitPorts.length
    ) {
      continue
    }

    const coordinate = (port: PositionedPort) =>
      side === "left" || side === "right" ? port.y : port.x
    if (
      hasDuplicatePositions(symbolPorts.map(coordinate)) ||
      hasDuplicatePositions(circuitPorts.map(coordinate))
    ) {
      continue
    }

    symbolPorts.sort((a, b) => coordinate(a) - coordinate(b))
    circuitPorts.sort((a, b) => coordinate(a) - coordinate(b))
    for (let index = 0; index < symbolPorts.length; index++) {
      const symbolPort = symbolPorts[index]
      const circuitPort = circuitPorts[index]
      if (!symbolPort || !circuitPort) continue
      const pinNumber = circuitPort.port.pin_number
      if (pinNumber !== undefined && pinNumber !== null) {
        matches.set(symbolPort.index, String(pinNumber))
      }
    }
  }

  return matches
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
  symbolData: SymbolData
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

  const circuitPinNumbers = isChip
    ? new Map<number, string>()
    : getCircuitPinNumbers({
        symbolData,
        schematicComponent,
        schematicPorts,
      })

  for (const [i, port] of symbolData.ports.entries()) {
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
    const pinNum =
      circuitPinNumbers.get(i) || port.pinNumber?.toString() || `${i + 1}`
    pin._sxNumber = new SymbolPinNumber({
      value: pinNum,
      effects: numEffects,
    })

    pinSymbol.pins.push(pin)
  }

  return pinSymbol
}
