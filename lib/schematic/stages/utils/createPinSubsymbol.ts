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

/** Largest distance, in units of each port set's RMS radius, still counted as the same pin. */
const PIN_MATCH_MAX_RESIDUAL = 0.25

/**
 * Pin numbering already emitted for each shared library symbol, so that two instances needing
 * different numbering fail loudly instead of the first one winning. Cleared per conversion.
 */
export const pinNumberingByLibId = new Map<string, string>()

function normalize(points: { x: number; y: number }[]) {
  const n = points.length
  const cx = points.reduce((s, p) => s + p.x, 0) / n
  const cy = points.reduce((s, p) => s + p.y, 0) / n
  const rms = Math.sqrt(
    points.reduce((s, p) => s + (p.x - cx) ** 2 + (p.y - cy) ** 2, 0) / n,
  )
  if (rms < 1e-9) return null
  return points.map((p) => ({ x: (p.x - cx) / rms, y: (p.y - cy) / rms }))
}

/**
 * KiCad joins a symbol's pins to its footprint pads BY NUMBER, so each pin's number must be the
 * pin_number of the CIRCUIT port drawn at that pin. Symbol-library artwork carries no pin
 * numbers, so the exporter used to fall back to library order, which misnumbers a four-pad
 * crystal and crosses a polarized capacitor's pins; reading a numeric label instead reverses an
 * LED whose pin 1 is labelled as the cathode.
 *
 * Only library artwork is matched: ports built from the circuit's own schematic_ports already
 * carry its pin numbers and are left alone. The symbol ports and the component's circuit ports
 * are compared after normalizing each set about its centroid, so a symbol drawn at a different
 * scale from its placement still matches. The circuit's numbers are used only when every symbol
 * port has exactly one mutually nearest circuit port; anything less clear keeps the symbol's own
 * numbering, exactly as before. The one hard failure is a conflict the circuit itself states: two
 * instances of one shared library symbol whose clean matches need different numbering, which a
 * single definition cannot carry.
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
  if (ports.length < 2) return null
  if (ports.some((p) => p.pinNumber !== undefined && p.pinNumber !== null))
    return null
  const own = schematicPorts.filter(
    (p) =>
      p.schematic_component_id === schematicComponent.schematic_component_id,
  )
  if (own.length !== ports.length) return null
  const a = normalize(ports.map((p) => ({ x: p.x ?? 0, y: p.y ?? 0 })))
  const b = normalize(own.map((p) => ({ x: p.center.x, y: p.center.y })))
  if (!a || !b) return null
  const dist = (i: number, j: number) =>
    Math.hypot(a[i]!.x - b[j]!.x, a[i]!.y - b[j]!.y)
  const nearest = (count: number, d: (k: number) => number) => {
    let best = -1
    let bestD = Infinity
    for (let k = 0; k < count; k++) {
      const dk = d(k)
      if (dk < bestD) {
        bestD = dk
        best = k
      }
    }
    return { best, bestD }
  }
  const numbers: string[] = []
  const used = new Set<number>()
  for (let i = 0; i < a.length; i++) {
    const { best: j, bestD } = nearest(b.length, (k) => dist(i, k))
    const { best: back } = nearest(a.length, (m) => dist(m, j))
    if (back !== i || bestD > PIN_MATCH_MAX_RESIDUAL || used.has(j)) return null
    used.add(j)
    const pinNumber = own[j]!.pin_number
    if (pinNumber === undefined || pinNumber === null) return null
    numbers.push(String(pinNumber))
  }
  if (new Set(numbers).size !== numbers.length) return null
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
