import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { Circuit } from "tscircuit-latest"

test("keeps each NC marker on its symbol's schematic sheet", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={30} height={20} routingDisabled>
      <chip
        name="UROOT"
        footprint="soic8"
        pinLabels={{ pin1: "IN", pin2: "NC" }}
      />
      <schematicsheet name="Logic" displayName="Logic" sheetIndex={0}>
        <chip
          name="U1"
          footprint="soic8"
          schRotation={90}
          pinLabels={{ pin1: "IN", pin2: "NC" }}
          schPinArrangement={{
            leftSide: { pins: [1], direction: "top-to-bottom" },
            rightSide: { pins: [2], direction: "top-to-bottom" },
          }}
          noConnect={["NC"]}
        />
      </schematicsheet>
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  expect(
    circuitJson.filter(
      (element) => element.type === "source_port" && element.do_not_connect,
    ),
  ).toHaveLength(1)

  const converter = new CircuitJsonToKicadSchConverter(circuitJson, {
    schematicSheets: circuitJson
      .filter((element) => element.type === "schematic_sheet")
      .map((sheet) => ({
        schematicSheetId: sheet.schematic_sheet_id,
        circuitOrigin: { x: 100, y: 100 },
      })),
  })
  converter.runUntilFinished()
  const files = converter.getOutputFiles({
    schematicFilename: "no-connect.kicad_sch",
  })
  expect(files).toHaveLength(2)
  const root = parseKicadSch(files[0]!.content)
  expect(root.symbols).toHaveLength(1)
  expect(root.noConnects).toHaveLength(0)

  const child = parseKicadSch(files[1]!.content)
  expect(child.symbols).toHaveLength(1)
  expect(child.noConnects).toHaveLength(1)
  const symbol = child.symbols[0]!
  const marker = child.noConnects[0]!
  expect([marker.at!.x, marker.at!.y]).toEqual([115.75, 100])
  const ncPin = child
    .libSymbols!.symbols.find(
      (librarySymbol) => librarySymbol.libraryId === symbol.libraryId,
    )!
    .subSymbols.flatMap((subSymbol) => subSymbol.pins)
    .find((pin) => pin.numberString === "2")!
  expect(marker.at!.x).toBeCloseTo(symbol.at!.x + ncPin.at!.x)
  expect(marker.at!.y).toBeCloseTo(symbol.at!.y - ncPin.at!.y)
})
