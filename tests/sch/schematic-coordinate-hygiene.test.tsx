import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { toSchematicInternalUnits } from "lib/schematic/stages/utils/schematicCoordinates"
import ledWaterAccelerometer from "tests/assets/led-water-accelerometer.json"
import { Circuit } from "tscircuit"

function getTupleXY(value: unknown): { x: number; y: number } {
  if (Array.isArray(value)) {
    return { x: Number(value[0] ?? 0), y: Number(value[1] ?? 0) }
  }
  if (value && typeof value === "object" && "x" in value && "y" in value) {
    return {
      x: Number((value as { x: number }).x),
      y: Number((value as { y: number }).y),
    }
  }
  return { x: 0, y: 0 }
}

test("emits decimal-clean schematic coordinates with exact pin-wire coincidence and T-junction dots", async () => {
  const converter = new CircuitJsonToKicadSchConverter(
    ledWaterAccelerometer as any,
  )
  converter.runUntilFinished()
  const output = converter.getOutputString()

  // 1. No raw IEEE float representation noise (>4 decimal places)
  expect(output.match(/-?\d+\.\d{5,}/g) ?? []).toEqual([])

  const schematic = parseKicadSch(output)
  const wires = (schematic.wires ?? []).map((wire) => {
    const pts = (wire.points?.points ?? []).map((pt) => getTupleXY(pt))
    return { from: pts[0]!, to: pts[1]! }
  })
  const wireEndpoints = wires.flatMap((w) => [w.from, w.to])
  const wireEndpointKeys = new Set(
    wireEndpoints.map(
      (pt) =>
        `${toSchematicInternalUnits(pt.x)},${toSchematicInternalUnits(pt.y)}`,
    ),
  )

  // 2. Every 3-wire T-endpoint (3+ distinct wire directions meeting at a point) has a junction dot
  const junctionKeys = new Set(
    (schematic.junctions ?? []).map((junction) => {
      const at = getTupleXY((junction as any)._sxAt ?? junction.at)
      return `${toSchematicInternalUnits(at.x)},${toSchematicInternalUnits(at.y)}`
    }),
  )
  const endpointDirections = new Map<string, Set<string>>()
  for (const wire of wires) {
    const kFrom = `${toSchematicInternalUnits(wire.from.x)},${toSchematicInternalUnits(wire.from.y)}`
    const kTo = `${toSchematicInternalUnits(wire.to.x)},${toSchematicInternalUnits(wire.to.y)}`
    const dx =
      toSchematicInternalUnits(wire.to.x) -
      toSchematicInternalUnits(wire.from.x)
    const dy =
      toSchematicInternalUnits(wire.to.y) -
      toSchematicInternalUnits(wire.from.y)
    if (dx === 0 && dy === 0) continue
    const dirFrom = `${Math.sign(dx)},${Math.sign(dy)}`
    const dirTo = `${Math.sign(-dx)},${Math.sign(-dy)}`
    if (!endpointDirections.has(kFrom)) endpointDirections.set(kFrom, new Set())
    if (!endpointDirections.has(kTo)) endpointDirections.set(kTo, new Set())
    endpointDirections.get(kFrom)!.add(dirFrom)
    endpointDirections.get(kTo)!.add(dirTo)
  }
  for (const [key, dirs] of endpointDirections) {
    if (dirs.size >= 3) {
      expect(junctionKeys.has(key)).toBe(true)
    }
  }

  // 3. Every wire-connected symbol pin coincides bit-for-bit with its wire endpoint
  const libPinsById = new Map<string, Array<{ x: number; y: number }>>()
  for (const libSymbol of schematic.libSymbols?.symbols ?? []) {
    const pins: Array<{ x: number; y: number }> = []
    for (const sub of libSymbol.subSymbols ?? []) {
      for (const pin of sub.pins ?? []) {
        pins.push(getTupleXY(pin.at))
      }
    }
    if (libSymbol.libraryId) {
      libPinsById.set(libSymbol.libraryId, pins)
    }
  }

  for (const symbol of schematic.symbols ?? []) {
    const libId = (symbol as any)._sxLibId?.value ?? symbol.libraryId
    const at = getTupleXY(symbol.at)
    for (const pin of libPinsById.get(libId) ?? []) {
      const tipX = at.x + pin.x
      const tipY = at.y - pin.y
      let closestDist = Number.POSITIVE_INFINITY
      let closestWirePt: { x: number; y: number } | undefined
      for (const wp of wireEndpoints) {
        const d = Math.hypot(wp.x - tipX, wp.y - tipY)
        if (d < closestDist) {
          closestDist = d
          closestWirePt = wp
        }
      }
      if (closestWirePt && closestDist < 0.05) {
        const key = `${toSchematicInternalUnits(tipX)},${toSchematicInternalUnits(tipY)}`
        expect(wireEndpointKeys.has(key)).toBe(true)
      }
    }
  }
})

test("connector and chip pins at half-unit rounding ties coincide exactly with wire endpoints", async () => {
  const halfUnitOffset = 0.00005 / 15
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      <connector
        name="J1"
        pinLabels={{ pin1: "1", pin2: "2", pin3: "3" }}
        footprint="pinrow3"
        schWidth={0.5}
        schHeight={1.2}
        schPinArrangement={{
          rightSide: {
            direction: "top-to-bottom",
            pins: [1, 2, 3],
          },
        }}
        schX={1.3 + halfUnitOffset}
        schY={-0.7 + halfUnitOffset}
      />
      <resistor
        name="R1"
        resistance="10k"
        schX={5}
        schY={-0.7 + halfUnitOffset}
      />
      <trace from=".J1 > .pin2" to=".R1 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson, {
    schematicSheets: [{ circuitOrigin: { x: 148.5, y: 105 } }],
  })
  converter.runUntilFinished()
  const output = converter.getOutputString()

  expect(output.match(/-?\d+\.\d{5,}/g) ?? []).toEqual([])

  const schematic = parseKicadSch(output)
  const wirePoints = new Set(
    (schematic.wires ?? []).flatMap((wire) =>
      (wire.points?.points ?? []).map((pt) => {
        const xy = getTupleXY(pt)
        return `${toSchematicInternalUnits(xy.x)},${toSchematicInternalUnits(xy.y)}`
      }),
    ),
  )

  const j1Symbol = (schematic.symbols ?? []).find((sym) =>
    sym.properties.some((p) => p.key === "Reference" && p.value === "J1"),
  )
  expect(j1Symbol).toBeDefined()
  const j1LibId = (j1Symbol as any)._sxLibId?.value ?? j1Symbol?.libraryId
  const j1Lib = (schematic.libSymbols?.symbols ?? []).find(
    (s) => s.libraryId === j1LibId,
  )
  const pin2 = j1Lib?.subSymbols
    .flatMap((sub) => sub.pins)
    .find((pin) => pin._sxNumber?.value === "2")
  expect(pin2).toBeDefined()

  const symAt = getTupleXY(j1Symbol!.at)
  const pinAt = getTupleXY(pin2!.at)
  const pinTipKey = `${toSchematicInternalUnits(symAt.x) + toSchematicInternalUnits(pinAt.x)},${toSchematicInternalUnits(symAt.y) - toSchematicInternalUnits(pinAt.y)}`
  expect(wirePoints.has(pinTipKey)).toBe(true)
})
