import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib"
import type { KicadFootprintMetadata } from "@tscircuit/props"

test("applies all kicadFootprintMetadata fields to footprints", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm">
      <chip
        name="MC1"
        footprint="soic8"
        pinLabels={{
          pin1: "VCC",
          pin2: "GND",
          pin3: "IN1",
          pin4: "IN2",
          pin5: "OUT1",
          pin6: "OUT2",
          pin7: "NC1",
          pin8: "NC2",
        }}
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  // Create metadata map with all supported fields
  const footprintMetadataMap = new Map<string, KicadFootprintMetadata>()
  footprintMetadataMap.set("MC", {
    // footprintName - modifies libraryLink
    footprintName: "Custom_SOIC8",
    // layer - modifies footprint layer
    layer: "F.Cu",
    // embeddedFonts
    embeddedFonts: true,
    // properties
    properties: {
      Reference: {
        value: "MC**",
        at: { x: 0, y: -4 },
        layer: "F.SilkS",
        effects: {
          font: { size: { x: 0.8, y: 0.8 }, thickness: 0.12 },
        },
      },
      Value: {
        value: "CustomChip",
        at: { x: 0, y: 4 },
        layer: "F.Fab",
      },
      Datasheet: {
        value: "https://example.com/datasheet.pdf",
        hide: true,
      },
      Description: {
        value: "Custom microcontroller chip",
        hide: true,
      },
    },
    // attributes
    attributes: {
      smd: true,
      exclude_from_bom: true,
      exclude_from_pos_files: true,
    },
    // model - 3D model configuration
    model: {
      path: "${KIPRJMOD}/3dmodels/CustomChip.step",
      offset: { x: 0, y: 0, z: 0.5 },
      scale: { x: 1, y: 1, z: 1 },
      rotate: { x: 0, y: 0, z: 90 },
    },
  })

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson as any, {
    footprintMetadataMap,
  })
  converter.runUntilFinished()

  const output = converter.getOutputString()

  // Verify footprintName is applied
  expect(output).toContain('"Custom_SOIC8"')

  // Verify embeddedFonts is applied
  expect(output).toContain("(embedded_fonts yes)")

  // Verify properties - Reference (uses actual component name, not metadata value)
  expect(output).toContain('(property "Reference" "MC1"')
  expect(output).toContain("(size 0.8 0.8)")
  expect(output).toContain("(thickness 0.12)")

  // Verify properties - Value (explicit Value.value takes precedence over footprintName)
  expect(output).toContain('(property "Value" "CustomChip"')

  // Verify properties - Datasheet
  expect(output).toContain(
    '(property "Datasheet" "https://example.com/datasheet.pdf"',
  )

  // Verify properties - Description
  expect(output).toContain(
    '(property "Description" "Custom microcontroller chip"',
  )

  // Verify attributes
  expect(output).toContain("(attr smd")
  expect(output).toContain("exclude_from_bom")
  expect(output).toContain("exclude_from_pos_files")

  // Verify model
  expect(output).toContain('"${KIPRJMOD}/3dmodels/CustomChip.step"')
  expect(output).toContain("(xyz 0 0 0.5)")
  expect(output).toContain("(xyz 1 1 1)")
  expect(output).toContain("(xyz 0 0 90)")
})
