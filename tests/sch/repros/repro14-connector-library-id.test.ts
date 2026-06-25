import { expect, test } from "bun:test"
import { getLibraryId } from "lib/schematic/getLibraryId"

const schematicComponent = {
  type: "schematic_component",
  schematic_component_id: "schematic_component_0",
  center: { x: 0, y: 0 },
  size: { width: 1, height: 1 },
  is_box_with_pins: true,
} as any

test("connector library ids use KiCad Connector_Generic names", () => {
  expect(
    getLibraryId(
      {
        type: "source_component",
        source_component_id: "source_component_0",
        name: "J1",
        ftype: "simple_pin_header",
        pin_count: 8,
        gender: "male",
      } as any,
      schematicComponent,
    ),
  ).toBe("Connector_Generic:Conn_01x08")

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
})
