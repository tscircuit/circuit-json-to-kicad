import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { Circuit } from "tscircuit"

const isMultipleOfGrid = (val: number, grid = 1.27): boolean => {
  const quotient = Math.round(val / grid)
  return Math.abs(val - quotient * grid) < 1e-4
}

test("issue #878: custom symbol pin ends snap to 1.27mm grid and accept custom pin length via kicadSymbolMetadata", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm">
      <chip
        name="U1"
        footprint="0402"
        symbol={
          <symbol name="MyPart">
            <schematicpath
              strokeWidth={0.05}
              points={[
                { x: -0.5, y: 0 },
                { x: 0.5, y: 0 },
              ]}
            />
            <port
              name="1"
              pinNumber={1}
              direction="right"
              schX={0.5}
              schY={0}
            />
          </symbol>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  // Supply metadata at Circuit JSON boundary (matches tests/custom-kicad-properties.test.tsx)
  const schSym = circuitJson.find((el) => el.type === "schematic_symbol") as any
  schSym.metadata = {
    kicad_symbol: {
      pinLength: 2.54,
      snapToGrid: true,
    },
  }

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  const sch = parseKicadSch(output)
  const libSymbol = sch.libSymbols?.symbols[0]
  expect(libSymbol).toBeDefined()

  const pinSubsymbol = libSymbol?.subSymbols.find((s) =>
    s.libraryId?.endsWith("_1_1"),
  )
  expect(pinSubsymbol).toBeDefined()
  const pin = pinSubsymbol?.pins[0]
  expect(pin).toBeDefined()

  // Pin length should match specified metadata length (2.54mm instead of default 0.01mm)
  expect(pin?.length).toBe(2.54)

  // Pin coordinates should be aligned to KiCad 1.27mm grid
  const pinX = pin!.at!.x
  const pinY = pin!.at!.y
  expect(isMultipleOfGrid(pinX, 1.27)).toBe(true)
  expect(isMultipleOfGrid(pinY, 1.27)).toBe(true)
  // 0.5 * 15 = 7.5mm, snapped to 1.27mm grid is 7.62mm (6 * 1.27)
  expect(pinX).toBe(7.62)
  expect(pinY).toBe(0)
})

test("issue #878: custom symbol with converter snapToGrid and customSymbolPinLength options", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm">
      <chip
        name="U1"
        footprint="0402"
        symbol={
          <symbol name="MyPart">
            <schematicpath
              strokeWidth={0.05}
              points={[
                { x: -0.5, y: 0 },
                { x: 0.5, y: 0 },
              ]}
            />
            <port
              name="1"
              pinNumber={1}
              direction="right"
              schX={0.5}
              schY={0}
            />
          </symbol>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadSchConverter(circuitJson, {
    snapToGrid: true,
    customSymbolPinLength: 2.54,
  })
  converter.runUntilFinished()
  const output = converter.getOutputString()

  const sch = parseKicadSch(output)
  const libSymbol = sch.libSymbols?.symbols[0]
  const pinSubsymbol = libSymbol?.subSymbols.find((s) =>
    s.libraryId?.endsWith("_1_1"),
  )
  const pin = pinSubsymbol?.pins[0]

  expect(pin?.length).toBe(2.54)
  expect(isMultipleOfGrid(pin!.at!.x, 1.27)).toBe(true)
  expect(isMultipleOfGrid(pin!.at!.y, 1.27)).toBe(true)
  expect(pin!.at!.x).toBe(7.62)
  expect(pin!.at!.y).toBe(0)
})

test("issue #878: custom symbol with schematicScaleFactor exports at KiCad standard size on 1.27mm grid", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm">
      <chip
        name="U1"
        footprint="0402"
        symbol={
          <symbol name="MyPart">
            <schematicpath
              strokeWidth={0.05}
              points={[
                { x: -0.5, y: 0 },
                { x: 0.5, y: 0 },
              ]}
            />
            <port
              name="1"
              pinNumber={1}
              direction="right"
              schX={0.5}
              schY={0}
            />
          </symbol>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  // Using scale factor 2.54 (standard 100 mil KiCad grid unit):
  // 1 schematic unit = 2.54mm in KiCad
  const converter = new CircuitJsonToKicadSchConverter(circuitJson, {
    schematicScaleFactor: 2.54,
    customSymbolPinLength: 1.27,
  })
  converter.runUntilFinished()
  const output = converter.getOutputString()

  const sch = parseKicadSch(output)
  const libSymbol = sch.libSymbols?.symbols[0]
  const pinSubsymbol = libSymbol?.subSymbols.find((s) =>
    s.libraryId?.endsWith("_1_1"),
  )
  const pin = pinSubsymbol?.pins[0]

  expect(pin?.length).toBe(1.27)
  // 0.5 * 2.54 = 1.27mm, which lands exactly on 1.27mm grid!
  expect(pin!.at!.x).toBe(1.27)
  expect(pin!.at!.y).toBe(0)
  expect(isMultipleOfGrid(pin!.at!.x, 1.27)).toBe(true)
})

test("issue #878: custom symbol with per-pin kicadSymbolMetadata individual pin lengths and electrical types", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm">
      <chip
        name="U1"
        footprint="0402"
        symbol={
          <symbol name="MyPart">
            <schematicpath
              strokeWidth={0.05}
              points={[
                { x: -0.5, y: 0 },
                { x: 0.5, y: 0 },
              ]}
            />
            <port
              name="1"
              pinNumber={1}
              direction="right"
              schX={0.5}
              schY={0}
            />
            <port
              name="2"
              pinNumber={2}
              direction="left"
              schX={-0.5}
              schY={0}
            />
          </symbol>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const schSym = circuitJson.find((el) => el.type === "schematic_symbol") as any
  schSym.metadata = {
    kicad_symbol: {
      snapToGrid: true,
      pins: {
        "1": { pinLength: 3.81, electricalType: "output" },
        "2": { pinLength: 2.54, electricalType: "input" },
      },
    },
  }

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const sch = parseKicadSch(converter.getOutputString())
  const libSymbol = sch.libSymbols?.symbols[0]
  const pinSubsymbol = libSymbol?.subSymbols.find((s) =>
    s.libraryId?.endsWith("_1_1"),
  )

  const pin1 = pinSubsymbol?.pins.find(
    (p: any) => (p._sxNumber?.value ?? p.number?.value) === "1",
  )
  const pin2 = pinSubsymbol?.pins.find(
    (p: any) => (p._sxNumber?.value ?? p.number?.value) === "2",
  )

  expect(pin1).toBeDefined()
  expect(pin2).toBeDefined()
  expect(pin1?.length).toBe(3.81)
  expect(pin1?.pinElectricalType).toBe("output")
  expect(isMultipleOfGrid(pin1!.at!.x, 1.27)).toBe(true)

  expect(pin2?.length).toBe(2.54)
  expect(pin2?.pinElectricalType).toBe("input")
  expect(isMultipleOfGrid(pin2!.at!.x, 1.27)).toBe(true)
})

test("issue #878: custom symbol with port stem length and useStemLengthAsPinLength", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm">
      <chip
        name="U1"
        footprint="0402"
        symbol={
          <symbol name="MyPart">
            <schematicrect width={1} height={1} />
            <port
              name="1"
              pinNumber={1}
              direction="right"
              schX={0.5}
              schY={0}
              schStemLength={0.5}
            />
          </symbol>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const schSym = circuitJson.find((el) => el.type === "schematic_symbol") as any
  schSym.metadata = {
    kicad_symbol: {
      useStemLengthAsPinLength: true,
      snapToGrid: true,
    },
  }

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const sch = parseKicadSch(converter.getOutputString())
  const libSymbol = sch.libSymbols?.symbols[0]
  const pinSubsymbol = libSymbol?.subSymbols.find((s) =>
    s.libraryId?.endsWith("_1_1"),
  )
  const pin = pinSubsymbol?.pins[0]

  // Stem length 0.5 * 15 = 7.5mm, snapped to 1.27mm grid is 7.62mm
  expect(pin?.length).toBe(7.62)
  expect(isMultipleOfGrid(pin!.at!.x, 1.27)).toBe(true)
})

test("issue #878: standalone library export aligns custom symbol pins to 1.27mm grid", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm">
      <chip
        name="U1"
        footprint="0402"
        symbol={
          <symbol name="MyGridPart">
            <schematicrect width={1} height={1} />
            <port
              name="1"
              pinNumber={1}
              direction="right"
              schX={0.5}
              schY={0}
            />
          </symbol>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const schSym = circuitJson.find((el) => el.type === "schematic_symbol") as any
  schSym.metadata = {
    kicad_symbol: {
      snapToGrid: true,
      pinLength: 2.54,
    },
  }

  const converter = new KicadLibraryConverter({
    kicadLibraryName: "grid-test",
    entrypoint: "component.tsx",
    getExportsFromTsxFile: async () => ["MyGridPart"],
    buildFileToCircuitJson: async () => circuitJson,
  })
  await converter.run()
  const output = converter.getOutput().kicadProjectFsMap
  const symbolContent = String(output["symbols/grid-test.kicad_sym"])

  expect(symbolContent).toContain("(length 2.54)")
  expect(symbolContent).toContain("(at 7.62 0 180)")
})
