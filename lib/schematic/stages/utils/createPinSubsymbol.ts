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

const PIN_MATCH_TOLERANCE = 0.05

/**
 * Pin numbering already emitted for each shared library symbol, so that two instances needing
 * different numbering fail loudly instead of the first one winning. Cleared per conversion.
 */
export const pinNumberingByLibId = new Map<string, string>()

/**
 * KiCad joins a symbol's pins to its footprint pads BY NUMBER, so each pin's number must be the
 * pin_number of the CIRCUIT port that sits at that pin. The symbol's own port order and labels
 * describe the symbol's convention, not the circuit's: library order puts a four-pad crystal's pad 1
 * on pin 3, and a circuit that labels an LED's pin 1 as the cathode (the opposite of the default)
 * gets its polarity reversed if the number is read off the symbol.
 *
 * The circuit's number wins whenever the circuit supplies one. Where it supplies none (no
 * schematic_port for the component, or a matched port without a pin_number) there is nothing to
 * contradict the symbol, so that pin keeps the symbol's own number. What cannot be decided fails
 * loudly instead of choosing: a symbol port with no counterpart when the component does have
 * ports, two symbol ports on one circuit port, a number used twice, or two instances of one shared
 * library symbol needing different numbering. Returns null when nothing is to be overridden.
 */
function matchSymbolPortsToCircuit({
  libId,
  symbolData,
  schematicComponent,
  schematicPorts,
}: {
  libId: string
  symbolData: any
  schematicComponent: SchematicComponent
  schematicPorts: SchematicPort[]
}): string[] | null {
  const ports: any[] = symbolData.ports || []
  if (ports.length === 0) return null
  const own = schematicPorts.filter(
    (p) =>
      p.schematic_component_id === schematicComponent.schematic_component_id,
  )
  // No circuit ports: nothing contradicts the symbol's own numbering.
  if (own.length === 0) return null
  const cx = symbolData.center?.x ?? 0
  const cy = symbolData.center?.y ?? 0
  const used = new Map<string, number>()
  const numbers = ports.map((port, i) => {
    const sx = (port.x ?? 0) - cx
    const sy = (port.y ?? 0) - cy
    let best: SchematicPort | null = null
    let bestDist = Infinity
    for (const sp of own) {
      const d = Math.hypot(
        sp.center.x - schematicComponent.center.x - sx,
        sp.center.y - schematicComponent.center.y - sy,
      )
      if (d < bestDist) {
        bestDist = d
        best = sp
      }
    }
    if (!best || bestDist > PIN_MATCH_TOLERANCE) {
      throw new Error(
        `${libId}: symbol port ${i} at (${sx.toFixed(3)},${sy.toFixed(3)}) matches no circuit port within ${PIN_MATCH_TOLERANCE}; refusing to guess a pin number`,
      )
    }
    if (used.has(best.schematic_port_id)) {
      throw new Error(
        `${libId}: symbol ports ${used.get(best.schematic_port_id)} and ${i} both land on ${best.schematic_port_id}; refusing to guess`,
      )
    }
    used.set(best.schematic_port_id, i)
    // A matched circuit port without a pin_number has nothing to say; keep the symbol's own number.
    if (best.pin_number === undefined || best.pin_number === null) {
      return port.pinNumber?.toString() || `${i + 1}`
    }
    return String(best.pin_number)
  })
  if (new Set(numbers).size !== numbers.length) {
    throw new Error(
      `${libId}: pin numbers ${numbers.join(",")} repeat within one symbol; refusing to guess`,
    )
  }
  const key = numbers.join(",")
  const prior = pinNumberingByLibId.get(libId)
  if (prior !== undefined && prior !== key) {
    throw new Error(
      `${libId}: instances disagree on pin numbering (${prior} vs ${key}); a shared symbol cannot carry both`,
    )
  }
  pinNumberingByLibId.set(libId, key)
  return numbers
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
  // Non-chip artwork already draws the visible lead up to each port.
  const CUSTOM_SYMBOL_PIN_LENGTH = 0.01

  const circuitPinNumbers =
    !isChip && schematicComponent
      ? matchSymbolPortsToCircuit({
          libId,
          symbolData,
          schematicComponent,
          schematicPorts,
        })
      : null

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
    const pinNum = circuitPinNumbers
      ? circuitPinNumbers[i]
      : port.pinNumber?.toString() || `${i + 1}`
    pin._sxNumber = new SymbolPinNumber({
      value: pinNum,
      effects: numEffects,
    })

    pinSymbol.pins.push(pin)
  }

  return pinSymbol
}
