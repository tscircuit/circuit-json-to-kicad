import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import type {
  CircuitJson,
  PcbComponent,
  SchematicSymbol as CircuitJsonSchematicSymbol,
} from "circuit-json"
import { parseKicadPcb, parseKicadSch } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { CircuitJsonToKicadModConverter } from "lib/footprint/CircuitJsonToKicadModConverter"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"

// Supply Circuit JSON directly so these exporter regressions are independent of
// the @tscircuit/props and circuit-json schema releases for props#986.
const footprintMetadata = {
  properties: {
    Reference: { value: "CUSTOM**" },
    Value: { value: "MyPart" },
    Max_Current_A: {
      value: "6.4",
      hide: true,
      at: { x: 2, y: 3, rotation: 90 },
      layer: "B.Fab",
      uuid: "12345678-1234-1234-1234-123456789abc",
      effects: { font: { size: { x: 1, y: 2 }, thickness: 0.2 } },
    },
    Empty: { value: "", hide: false },
    MPN: { value: "custom-mpn" },
  },
}
const symbolMetadata = {
  properties: {
    Value: { value: "MyPart" },
    Max_Current_A: {
      value: "6.4",
      id: 42,
      at: { x: 20, y: 30, rotation: 90 },
      effects: {
        hide: true,
        justify: ["left", "bottom"],
        font: { size: { x: 1, y: 2 }, thickness: 0.2 },
      },
    },
    Empty: { value: "", effects: { hide: false } },
  },
}

async function getCircuitJson(): Promise<CircuitJson> {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <chip
        name="U1"
        manufacturerPartNumber="generated-mpn"
        symbol={
          <symbol name="MyPart">
            <schematicrect width={1} height={1} />
            <port name="pin1" direction="left" schX={-0.5} />
          </symbol>
        }
        footprint={
          <footprint>
            <smtpad shape="rect" width={1} height={1} portHints={["pin1"]} />
          </footprint>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const pcbComponent = circuitJson.find(
    (element): element is PcbComponent => element.type === "pcb_component",
  )
  const schematicSymbol = circuitJson.find(
    (element): element is CircuitJsonSchematicSymbol =>
      element.type === "schematic_symbol",
  )
  if (!pcbComponent || !schematicSymbol)
    throw new Error("Missing test component")
  pcbComponent.metadata = { kicad_footprint: footprintMetadata }
  schematicSymbol.metadata = { kicad_symbol: symbolMetadata }
  return circuitJson
}

test("PCB export preserves custom footprint properties and overrides generated fields once", async () => {
  const converter = new CircuitJsonToKicadPcbConverter(await getCircuitJson())
  converter.runUntilFinished()
  const footprint = parseKicadPcb(converter.getOutputString()).footprints[0]!
  const customProperty = footprint.properties.find(
    (property) => property.key === "Max_Current_A",
  )!
  expect(customProperty.value).toBe("6.4")
  expect(customProperty.position).toMatchObject({ x: 2, y: 3, angle: 90 })
  expect(customProperty.layer?.names).toEqual(["B.Fab"])
  expect(customProperty.uuid?.value).toBe(
    footprintMetadata.properties.Max_Current_A.uuid,
  )
  expect(customProperty.hidden).toBe(true)
  expect(customProperty.effects?.font?.size).toEqual({ width: 1, height: 2 })
  expect(customProperty.effects?.font?.thickness).toBe(0.2)
  expect(
    footprint.properties.filter((property) => property.key === "Value"),
  ).toHaveLength(1)
  expect(
    footprint.properties.find((property) => property.key === "Value")?.value,
  ).toBe("MyPart")
  expect(
    footprint.properties.filter((property) => property.key === "MPN"),
  ).toHaveLength(1)
  expect(
    footprint.properties.find((property) => property.key === "MPN")?.value,
  ).toBe("custom-mpn")
  expect(
    footprint.properties.find((property) => property.key === "Empty"),
  ).toMatchObject({ value: "", hidden: false })
})

test("schematic instances preserve custom symbol properties and their presentation", async () => {
  const circuitJson = await getCircuitJson()
  const schematicComponent = circuitJson.find(
    (element) => element.type === "schematic_component",
  )
  if (!schematicComponent) throw new Error("Missing test component")
  schematicComponent.metadata = {
    kicad_symbol: { properties: { Max_Current_A: { value: "99" } } },
  }
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  expect(converter.getOutputString()).not.toContain(
    '(property "Max_Current_A" "99"',
  )
  const symbol = parseKicadSch(converter.getOutputString()).symbols[0]!
  const customProperty = symbol.properties.find(
    (property) => property.key === "Max_Current_A",
  )!
  expect(customProperty.value).toBe("6.4")
  expect(customProperty.id).toBe(42)
  expect(customProperty.at).toMatchObject({ x: 20, y: 30, angle: 90 })
  expect(customProperty.effects?.hiddenText).toBe(true)
  expect(customProperty.effects?.font?.size).toEqual({ width: 1, height: 2 })
  expect(customProperty.effects?.font?.thickness).toBe(0.2)
  expect(customProperty.effects?.justify).toMatchObject({
    horizontal: "left",
    vertical: "bottom",
  })
  expect(
    symbol.properties.find((property) => property.key === "Empty")?.id,
  ).toBe(43)
  expect(
    symbol.properties.filter((property) => property.key === "Value"),
  ).toHaveLength(1)
  expect(
    symbol.properties.find((property) => property.key === "Empty")?.value,
  ).toBe("")
})

test("standalone footprint export retains custom properties during library extraction", async () => {
  const converter = new CircuitJsonToKicadModConverter(await getCircuitJson())
  converter.runUntilFinished()
  expect(converter.getOutputString()).toContain(
    '(property "Max_Current_A" "6.4"',
  )
  expect(converter.getOutputString()).toContain('(property "Empty" ""')
})

test("library export preserves custom footprint and symbol metadata", async () => {
  const circuitJson = await getCircuitJson()
  const converter = new KicadLibraryConverter({
    kicadLibraryName: "custom-properties",
    entrypoint: "component.tsx",
    getExportsFromTsxFile: async () => ["MyPart"],
    buildFileToCircuitJson: async () => circuitJson,
  })
  await converter.run()
  const output = converter.getOutput().kicadProjectFsMap
  const footprint = String(
    output["footprints/custom-properties.pretty/MyPart.kicad_mod"],
  )
  const symbol = String(output["symbols/custom-properties.kicad_sym"])
  for (const contents of [footprint, symbol]) {
    expect(contents).toContain('(property "Max_Current_A" "6.4"')
    expect(contents).toContain('(property "Empty" ""')
    expect(contents).toContain("(size 2 1)")
    expect(contents).toContain("(thickness 0.2)")
  }
})
