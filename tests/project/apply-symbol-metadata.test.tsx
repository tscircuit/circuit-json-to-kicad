import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import type { KicadSymbolMetadata } from "@tscircuit/props"

test("applies all kicadSymbolMetadata fields to schematic symbols", async () => {
  const symbolMetadata: KicadSymbolMetadata = {
    // properties
    properties: {
      Reference: {
        value: "IC**",
        effects: { font: { size: { x: 1.0, y: 1.0 } } },
      },
      Value: {
        value: "LM358",
      },
      Footprint: {
        value: "Package_DIP:DIP-8_W7.62mm",
      },
      Datasheet: {
        value: "https://www.ti.com/lit/ds/symlink/lm358.pdf",
        effects: { hide: true },
      },
      Description: {
        value: "Dual Operational Amplifier",
        effects: { hide: true },
      },
      ki_keywords: {
        value: "dual opamp operational amplifier",
      },
      ki_fp_filters: {
        value: "SOIC*3.9x4.9mm*P1.27mm* DIP*W7.62mm*",
      },
    },
    // Boolean flags
    inBom: true,
    onBoard: true,
    excludeFromSim: true,
    // Pin settings
    pinNames: {
      offset: 1.016,
      hide: true,
    },
    pinNumbers: {
      hide: true,
    },
    // Embedded fonts
    embeddedFonts: true,
  }

  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm">
      <chip
        name="IC1"
        footprint="soic8"
        schX={0}
        schY={0}
        kicadSymbolMetadata={symbolMetadata}
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
        symbol={
          <symbol>
            <schematicline
              x1={-0.75}
              y1={-0.5}
              x2={0.75}
              y2={-0.5}
              strokeWidth={0.05}
            />
            <schematicline
              x1={0.75}
              y1={-0.5}
              x2={0.75}
              y2={0.5}
              strokeWidth={0.05}
            />
            <schematicline
              x1={0.75}
              y1={0.5}
              x2={-0.75}
              y2={0.5}
              strokeWidth={0.05}
            />
            <schematicline
              x1={-0.75}
              y1={0.5}
              x2={-0.75}
              y2={-0.5}
              strokeWidth={0.05}
            />
            <port name="pin1" direction="right" schX={1} schY={0} />
          </symbol>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()

  const converter = new CircuitJsonToKicadSchConverter(circuitJson as any)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  // Verify properties - Reference with custom font size
  expect(output).toContain('(property "Reference"')
  expect(output).toContain("(size 1 1)")

  // Verify properties - Value
  expect(output).toContain('(property "Value" "LM358"')

  // Verify properties - Footprint
  expect(output).toContain('(property "Footprint" "Package_DIP:DIP-8_W7.62mm"')

  // Verify properties - ki_keywords
  expect(output).toContain(
    '(property "ki_keywords" "dual opamp operational amplifier"',
  )

  // Verify properties - ki_fp_filters
  expect(output).toContain('(property "ki_fp_filters"')

  // Verify boolean flags
  expect(output).toContain("(in_bom yes)")
  expect(output).toContain("(on_board yes)")
  expect(output).toContain("(exclude_from_sim yes)")

  // Verify pinNames with offset and hide
  expect(output).toContain("(pin_names")
  expect(output).toContain("(offset 1.016)")

  // Verify pinNumbers with hide
  expect(output).toContain("(pin_numbers")

  // Verify embeddedFonts
  expect(output).toContain("(embedded_fonts yes)")
})
