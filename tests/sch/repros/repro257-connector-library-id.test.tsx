import { expect, test } from "bun:test"
import "bun-match-svg"
import { convertCircuitJsonToSchematicSvg } from "circuit-to-svg"

import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { getLibraryId } from "lib/schematic/getLibraryId"
import { Circuit } from "tscircuit"

test("simple connectors use KiCad Connector_Generic library IDs in schematic export", async () => {
  const schematicComponent = {
    type: "schematic_component",
    schematic_component_id: "schematic_component_0",
    center: { x: 0, y: 0 },
    size: { width: 1, height: 1 },
    is_box_with_pins: true,
  } as any

  expect(
    getLibraryId(
      {
        type: "source_component",
        source_component_id: "source_component_1",
        name: "PWR_USB",
        ftype: "simple_connector",
        standard: "usb_c",
      } as any,
      schematicComponent,
      null,
      undefined,
      24,
    ),
  ).toBe("Connector_Generic:Conn_01x24")

  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="30mm">
      <connector
        name="PWR_USB"
        pinLabels={{
          pin1: "VBUS",
          pin2: "D_N",
          pin3: "D_P",
          pin4: "GND",
        }}
        footprint="pinrow4"
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  expect(output).toContain('(symbol "Connector_Generic:Conn_01x04"')
  expect(output).toContain('(lib_id "Connector_Generic:Conn_01x04")')

  const svg = convertCircuitJsonToSchematicSvg(circuitJson as any)
  expect(svg).toMatchSvgSnapshot(import.meta.path)
}, 20_000)
