import { expect, test } from "bun:test"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { symbols } from "schematic-symbols"
import { applyToPoint } from "transformation-matrix"
import { Circuit } from "tscircuit-latest"

test("symbol fields preserve primitive positions and anchors in every orientation", async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const circuit = new Circuit()
    circuit.pcbDisabled = true
    circuit.add(
      <board>
        <resistor
          name="R_LONG_REFERENCE"
          resistance="10k"
          symbolName="boxresistor"
          schRotation={rotation}
          schX={-2}
        />
        <capacitor
          name="C_LONG_REFERENCE"
          capacitance="10uF"
          schRotation={rotation}
          schX={2}
        />
      </board>,
    )
    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson()
    const converter = new CircuitJsonToKicadSchConverter(circuitJson)
    converter.runUntilFinished()
    const schematic = parseKicadSch(converter.getOutputString())
    const vertical = rotation === 90 || rotation === 270

    for (const component of circuitJson.filter(
      (element) => element.type === "schematic_component",
    )) {
      const source = circuitJson.find(
        (element) =>
          element.type === "source_component" &&
          element.source_component_id === component.source_component_id,
      )!
      if (source.type !== "source_component") throw new Error("Missing source")
      const symbol = schematic.symbols.find((symbol) =>
        symbol.properties.some(
          (property) =>
            property.key === "Reference" && property.value === source.name,
        ),
      )!
      const definition = symbols[component.symbol_name as keyof typeof symbols]!
      for (const [key, placeholder] of [
        ["Reference", "{REF}"],
        ["Value", "{VAL}"],
      ]) {
        const primitive = definition.primitives.find(
          (primitive) =>
            primitive.type === "text" && primitive.text === placeholder,
        )!
        if (primitive.type !== "text")
          throw new Error("Missing field primitive")
        const expected = applyToPoint(converter.ctx.c2kMatSch!, {
          x: component.center.x + primitive.x - definition.center.x,
          y: component.center.y + primitive.y - definition.center.y,
        })
        const property = symbol.properties.find(
          (property) => property.key === key,
        )!
        expect(property.at!.x).toBeCloseTo(expected.x, 4)
        expect(property.at!.y).toBeCloseTo(expected.y, 4)
        expect(property.effects?.justify?.horizontal).toBe(
          vertical ? "left" : undefined,
        )
        expect(property.effects?.justify?.vertical).toBe(
          vertical && source.ftype === "simple_resistor"
            ? undefined
            : key === "Reference"
              ? "bottom"
              : "top",
        )
      }
    }
  }
})
