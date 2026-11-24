import { expect, test } from "bun:test"
import { $ } from "bun"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CircuitJson, Point } from "circuit-json"
import { parseKicadSch, Xy } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import {
  toSchematicInternalUnits,
  transformSchematicConnectionPoint,
} from "lib/schematic/stages/utils/schematicCoordinates"
import { compose, scale, translate } from "transformation-matrix"
import { Circuit } from "tscircuit"

const KICAD_GRID_IU = toSchematicInternalUnits(1.27)

function findHighPrecisionFloatTokens(kicadSchContent: string): string[] {
  const withoutQuotedStrings = kicadSchContent.replace(
    /"(?:\\.|[^"\\])*"/g,
    '""',
  )
  return withoutQuotedStrings.match(/-?\d+\.\d{5,}/g) ?? []
}

function pointKey(point: Point): string {
  return `${point.x},${point.y}`
}

function isPointStrictlyInsideSegment(
  point: Point,
  from: Point,
  to: Point,
): boolean {
  if (
    (point.x === from.x && point.y === from.y) ||
    (point.x === to.x && point.y === to.y)
  ) {
    return false
  }
  const cross =
    BigInt(point.x - from.x) * BigInt(to.y - from.y) -
    BigInt(point.y - from.y) * BigInt(to.x - from.x)
  return (
    cross === 0n &&
    point.x >= Math.min(from.x, to.x) &&
    point.x <= Math.max(from.x, to.x) &&
    point.y >= Math.min(from.y, to.y) &&
    point.y <= Math.max(from.y, to.y)
  )
}

function isPointOnSegmentOrEndpoint(
  point: Point,
  from: Point,
  to: Point,
): boolean {
  const cross =
    BigInt(point.x - from.x) * BigInt(to.y - from.y) -
    BigInt(point.y - from.y) * BigInt(to.x - from.x)
  return (
    cross === 0n &&
    point.x >= Math.min(from.x, to.x) &&
    point.x <= Math.max(from.x, to.x) &&
    point.y >= Math.min(from.y, to.y) &&
    point.y <= Math.max(from.y, to.y)
  )
}

test("emits decimal-clean coordinates, exact pin/wire/label coincidences, and T-junction dots", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      <chip
        name="U1"
        manufacturerPartNumber="ESP32-C3-MINI-1"
        schX={0}
        schY={0}
        pinLabels={{
          pin1: "GND",
          pin2: "3V3",
          pin3: "EN",
          pin4: "IO0",
          pin5: "TXD",
          pin6: "RXD",
        }}
      />
      <resistor name="R1" resistance="10k" schX={-4.5} schY={2.2} />
      <resistor name="R2" resistance="4.7k" schX={-4.5} schY={0} />
      <capacitor name="C1" capacitance="100nF" schX={-4.5} schY={-2.2} />
      <chip
        name="J1"
        manufacturerPartNumber="CONN-01X04"
        schX={5.3}
        schY={0.1}
        pinLabels={{
          pin1: "TXD",
          pin2: "RXD",
          pin3: "3V3",
          pin4: "GND",
        }}
      />
      {/* 3-branch T-intersection on EN pull-up + RC delay network */}
      <trace from=".U1 > .pin3" to=".R1 > .pin1" />
      <trace from=".U1 > .pin3" to=".C1 > .pin1" />
      <trace from=".R1 > .pin2" to="net.V3_3" />
      <trace from=".R2 > .pin1" to=".U1 > .pin4" />
      <trace from=".R2 > .pin2" to="net.V3_3" />
      <trace from=".U1 > .pin2" to="net.V3_3" />
      <trace from=".C1 > .pin2" to="net.GND" />
      <trace from=".U1 > .pin1" to="net.GND" />
      <trace from=".U1 > .pin5" to=".J1 > .pin1" />
      <trace from=".U1 > .pin6" to=".J1 > .pin2" />
      <trace from=".J1 > .pin3" to="net.V3_3" />
      <trace from=".J1 > .pin4" to="net.GND" />
      <schematicline
        x1={-6.123456}
        y1={-4.123456}
        x2={7.123456}
        y2={4.123456}
        strokeWidth={0.12}
      />
      <schematicarc
        center={{ x: 1.123456, y: 3.123456 }}
        radius={0.733333}
        startAngleDegrees={0}
        endAngleDegrees={90}
        strokeWidth={0.12}
      />
      <schematictext text="ESP32-C3 Core" schX={-5.123456} schY={1.5} />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  // Exercise vcc_up (15 * port.y = -1.653125) and ground_down
  // (port.x = 0.009999999999999983 -> previously emitted 96.89249999999998)
  for (const label of circuitJson) {
    if (label.type === "schematic_net_label") {
      if (label.symbol_name === "rail_up") label.symbol_name = "vcc_up"
      if (label.symbol_name === "rail_down") label.symbol_name = "ground_down"
    }
  }

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  // 1. Zero IEEE-754 >4 decimal float artifacts (e.g. 96.89249999999998)
  expect(findHighPrecisionFloatTokens(output)).toEqual([])

  const schematic = parseKicadSch(output)
  const libSymbolsById = new Map(
    (schematic.libSymbols?.symbols ?? []).map((sym) => [sym.libraryId, sym]),
  )

  const wireSegments = schematic.wires.map((wire) => {
    const pts = (wire.points?.points ?? []).filter(
      (pt): pt is Xy => pt instanceof Xy,
    )
    expect(pts).toHaveLength(2)
    return {
      from: {
        x: toSchematicInternalUnits(pts[0]!.x),
        y: toSchematicInternalUnits(pts[0]!.y),
      },
      to: {
        x: toSchematicInternalUnits(pts[1]!.x),
        y: toSchematicInternalUnits(pts[1]!.y),
      },
    }
  })
  expect(wireSegments.length).toBeGreaterThan(0)

  const labelAnchorKeys = new Set([
    ...schematic.globalLabels.map((l) =>
      pointKey({
        x: toSchematicInternalUnits(l.at!.x),
        y: toSchematicInternalUnits(l.at!.y),
      }),
    ),
    ...schematic.labels.map((l) =>
      pointKey({
        x: toSchematicInternalUnits(l.at!.x),
        y: toSchematicInternalUnits(l.at!.y),
      }),
    ),
  ])

  // Every wire endpoint lies on KiCad's 1.27 mm connection grid
  for (const seg of wireSegments) {
    expect(seg.from.x % KICAD_GRID_IU).toBe(0)
    expect(seg.from.y % KICAD_GRID_IU).toBe(0)
    expect(seg.to.x % KICAD_GRID_IU).toBe(0)
    expect(seg.to.y % KICAD_GRID_IU).toBe(0)
  }

  // 2. Every connected pin & power/ground symbol pin lands bit-for-bit on a wire or label anchor
  for (const placedSymbol of schematic.symbols) {
    const libId = placedSymbol.libraryId
    const libSymbol = libSymbolsById.get(libId)
    expect(libSymbol).toBeDefined()
    const originX = toSchematicInternalUnits(placedSymbol.at!.x)
    const originY = toSchematicInternalUnits(placedSymbol.at!.y)

    const reference = placedSymbol.properties.find(
      (prop) => prop.key === "Reference",
    )?.value

    for (const unit of libSymbol!.subSymbols) {
      for (const pin of unit.pins) {
        const pinNumber = pin._sxNumber?.value
        const sheetPinPoint = {
          x: originX + toSchematicInternalUnits(pin.at!.x),
          y: originY - toSchematicInternalUnits(pin.at!.y),
        }
        expect(sheetPinPoint.x % KICAD_GRID_IU).toBe(0)
        expect(sheetPinPoint.y % KICAD_GRID_IU).toBe(0)

        const touchesWireOrLabel =
          labelAnchorKeys.has(pointKey(sheetPinPoint)) ||
          wireSegments.some((seg) =>
            isPointOnSegmentOrEndpoint(sheetPinPoint, seg.from, seg.to),
          )
        expect(
          touchesWireOrLabel,
          `Expected ${reference ?? libId} pin ${pinNumber} at (${sheetPinPoint.x}, ${sheetPinPoint.y}) IU to coincide exactly with a wire or net label`,
        ).toBe(true)
      }
    }
  }

  // 3. Every 3-wire T-intersection has an exact coincident junction dot
  const junctionKeys = new Set(
    schematic.junctions.map((j) =>
      pointKey({
        x: toSchematicInternalUnits(j.at!.x),
        y: toSchematicInternalUnits(j.at!.y),
      }),
    ),
  )

  const endpointValence = new Map<string, number>()
  for (const seg of wireSegments) {
    for (const endpoint of [seg.from, seg.to]) {
      const key = pointKey(endpoint)
      endpointValence.set(key, (endpointValence.get(key) ?? 0) + 1)

      const splitsInterior = wireSegments.some((other) =>
        isPointStrictlyInsideSegment(endpoint, other.from, other.to),
      )
      if (splitsInterior) {
        expect(junctionKeys.has(key)).toBe(true)
      }
    }
  }
  for (const [key, count] of endpointValence) {
    if (count >= 3) {
      expect(junctionKeys.has(key)).toBe(true)
    }
  }

  // 4. Native KiCad ERC verification when kicad-cli is installed (CI container)
  if (Bun.which("kicad-cli")) {
    const directory = await mkdtemp(join(tmpdir(), "c2k-806-erc-"))
    try {
      const schematicPath = join(directory, "hygiene.kicad_sch")
      const reportPath = join(directory, "erc.json")
      await writeFile(schematicPath, output)
      await $`kicad-cli sch erc --format json --output ${reportPath} ${schematicPath}`.quiet()
      const report: {
        sheets: {
          violations: {
            type: string
            severity: string
            items: { description: string }[]
          }[]
        }[]
      } = JSON.parse(await readFile(reportPath, "utf8"))

      const connectivityViolations = report.sheets
        .flatMap((sheet) => sheet.violations)
        .filter((violation) =>
          [
            "pin_not_connected",
            "unconnected_wire_endpoint",
            "endpoint_off_grid",
          ].includes(violation.type),
        )
      expect(connectivityViolations).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}, 30_000)

test("rounds gridless connection points, standalone graphics, and sheet hierarchy nodes to 4 decimal places", () => {
  const unroundedFromGridless = transformSchematicConnectionPoint({
    transform: compose(translate(100.123456, 50.987654), scale(15, -15)),
    point: { x: 1 / 7, y: 2 / 7 },
  })
  expect(findHighPrecisionFloatTokens(`${unroundedFromGridless.x}`)).toEqual([])
  expect(findHighPrecisionFloatTokens(`${unroundedFromGridless.y}`)).toEqual([])

  const hierarchicalCircuitJson: CircuitJson = [
    {
      type: "schematic_sheet",
      schematic_sheet_id: "sheet-power",
      name: "PowerStage",
      sheet_index: 0,
    } as any,
    {
      type: "source_component",
      source_component_id: "src_comp_1",
      name: "Device:R",
      ftype: "simple_resistor",
      manufacturer_part_number: "10k",
    },
    {
      type: "schematic_component",
      schematic_component_id: "sch_comp_1",
      source_component_id: "src_comp_1",
      schematic_sheet_id: "sheet-power",
      center: { x: 0.123456, y: -0.654321 },
      size: { width: 2, height: 1 },
      is_box_with_pins: false,
    },
    {
      type: "schematic_path",
      schematic_path_id: "sch_path_comp_1",
      schematic_component_id: "sch_comp_1",
      schematic_sheet_id: "sheet-power",
      points: [
        { x: -0.876544, y: -1.154321 },
        { x: 1.123456, y: -1.154321 },
        { x: 0.123456, y: -0.154321 },
      ],
      is_filled: false,
      is_dashed: false,
    },
    {
      type: "schematic_rect",
      schematic_rect_id: "sch_rect_1",
      schematic_sheet_id: "sheet-power",
      center: { x: 1.333333, y: 2.666666 },
      width: 3.111111,
      height: 1.777777,
      rotation: 0,
      stroke_width: 0.12,
      color: "rgb(0, 0, 132)",
      is_filled: false,
      is_dashed: true,
    },
    {
      type: "schematic_path",
      schematic_path_id: "sch_path_standalone_1",
      schematic_sheet_id: "sheet-power",
      points: [
        { x: -1.333333, y: 0.777777 },
        { x: 2.666666, y: 0.777777 },
      ],
      stroke_width: 0.12,
      is_filled: false,
      is_dashed: false,
    },
    {
      type: "schematic_text",
      schematic_text_id: "sch_text_1",
      schematic_sheet_id: "sheet-power",
      text: "Power Note",
      position: { x: 0.333333, y: 1.777777 },
      font_size: 0.111111,
      rotation: 0,
      anchor: "center",
    },
  ]

  const converter = new CircuitJsonToKicadSchConverter(
    hierarchicalCircuitJson,
    {
      schematicSheets: [
        {
          circuitOrigin: { x: 105, y: 148.5 },
          hierarchyNode: {
            // -13.97 + 10.16 + 0.7 = -3.1100000000000003 in raw IEEE-754 math
            position: { x: 177.8, y: -13.97 },
            size: { height: 10.16, width: 22.86 },
          },
          schematicSheetId: "sheet-power",
        },
      ],
    },
  )

  const files = converter.getOutputFiles({
    schematicFilename: "root.kicad_sch",
  })
  expect(files.length).toBe(2)
  for (const file of files) {
    expect(findHighPrecisionFloatTokens(file.content)).toEqual([])
  }
})
