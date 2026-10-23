import { getPhysicalPinName } from "../../../utils/getPhysicalPinName"
import type {
  SchematicComponent,
  SchematicPort,
  SourcePort,
} from "circuit-json"
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
import { applyToPoint, type Matrix } from "transformation-matrix"
import { toSchematicInternalUnits } from "./schematicCoordinates"

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
  sourcePorts,
}: {
  symbolData: SymbolData
  schematicComponent?: SchematicComponent
  schematicPorts: SchematicPort[]
  sourcePorts: SourcePort[]
}): Map<number, string> {
  const matches = new Map<number, string>()
  if (!schematicComponent) return matches

  const sourcePortsById = new Map(
    sourcePorts.map((port) => [port.source_port_id, port]),
  )
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
      const pinNumber =
        circuitPort.port.pin_number ??
        (circuitPort.port.source_port_id
          ? sourcePortsById.get(circuitPort.port.source_port_id)?.pin_number
          : undefined)
      if (pinNumber !== undefined && pinNumber !== null) {
        matches.set(symbolPort.index, String(pinNumber))
      }
    }
  }

  return matches
}

function validateInferredPinNumbers(
  symbolData: SymbolData,
  inferredPinNumbers: Map<number, string>,
): Map<number, string> {
  const missingPinIndices = symbolData.ports
    .map((port, index) => (port.pinNumber == null ? index : undefined))
    .filter((index): index is number => index !== undefined)

  if (
    missingPinIndices.length === 0 ||
    missingPinIndices.some((index) => !inferredPinNumbers.has(index))
  ) {
    return new Map()
  }

  const resolvedPinNumbers = symbolData.ports.map(
    (port, index) =>
      port.pinNumber?.toString() ?? inferredPinNumbers.get(index),
  )
  if (
    resolvedPinNumbers.some((pinNumber) => pinNumber === undefined) ||
    new Set(resolvedPinNumbers).size !== resolvedPinNumbers.length
  ) {
    return new Map()
  }

  return inferredPinNumbers
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
  sourcePorts,
  c2kMatSch,
}: {
  libId: string
  symbolData: SymbolData
  isChip: boolean
  schematicComponent?: SchematicComponent
  schematicPorts: SchematicPort[]
  sourcePorts: SourcePort[]
  c2kMatSch: Matrix
}): SchematicSymbol {
  const pinSymbol = new SchematicSymbol({
    libraryId: `${libId.split(":")[1]}_1_1`,
  })

  const CHIP_PIN_LENGTH = 6.0
  // Non-chip artwork already draws the visible lead up to each port.
  const CUSTOM_SYMBOL_PIN_LENGTH = 0.01

  const inferredPinNumbers = isChip
    ? new Map<number, string>()
    : getCircuitPinNumbers({
        symbolData,
        schematicComponent,
        schematicPorts,
        sourcePorts,
      })
  const circuitPinNumbers = validateInferredPinNumbers(
    symbolData,
    inferredPinNumbers,
  )

  const origin = schematicComponent
    ? applyToPoint(c2kMatSch, schematicComponent.center)
    : { x: 0, y: 0 }

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
      // The sheet transform combines translation with scale(s, -s), so a is s.
      c2kMatSchScale: c2kMatSch.a,
    })
    // Custom/builtin artwork ports are positioned in symbolData's coordinate
    // system. Translate that source point directly into the sheet; rebuilding
    // it from the scaled local offset can change rounding at half-unit ties.
    const sheetPosition =
      !isChip && schematicComponent
        ? applyToPoint(c2kMatSch, {
            x:
              (port.x ?? 0) +
              (schematicComponent.center.x - (symbolData.center?.x ?? 0)),
            y:
              (port.y ?? 0) +
              (schematicComponent.center.y - (symbolData.center?.y ?? 0)),
          })
        : { x: origin.x + x, y: origin.y - y }

    // KiCad rounds the placed origin and each wire endpoint separately. Derive
    // the local pin offset from those integer positions so their sum is exact.
    // Library Y points up, whereas sheet Y points down.
    pin.at = [
      (toSchematicInternalUnits(sheetPosition.x) -
        toSchematicInternalUnits(origin.x)) /
        10_000,
      (toSchematicInternalUnits(origin.y) -
        toSchematicInternalUnits(sheetPosition.y)) /
        10_000,
      angle,
    ]
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
      port.pinNumber?.toString() ?? circuitPinNumbers.get(i) ?? `${i + 1}`
    const schematicPort = schematicPorts.find(
      (candidate) =>
        candidate.schematic_component_id ===
          schematicComponent?.schematic_component_id &&
        String(candidate.pin_number) === pinNum,
    )
    const sourcePort = sourcePorts.find(
      (candidate) => candidate.source_port_id === schematicPort?.source_port_id,
    )
    pin._sxNumber = new SymbolPinNumber({
      value: getPhysicalPinName(sourcePort) ?? pinNum,
      effects: numEffects,
    })

    pinSymbol.pins.push(pin)
  }

  return pinSymbol
}
