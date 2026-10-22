import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadSch } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import { symbols } from "schematic-symbols"
import { applyToPoint } from "transformation-matrix"
import { Circuit } from "tscircuit"
import { Circuit as LegacyCircuit } from "tscircuit-latest"

test("builtin symbol artwork and pins preserve legacy and current port positions", async () => {
  for (const CircuitVersion of [LegacyCircuit, Circuit]) {
    for (const rotation of [0, 90, 180, 270]) {
      const circuit = new CircuitVersion()
      circuit.pcbDisabled = true
      circuit.add(
        <board>
          <pushbutton
            name="S1"
            footprint="pushbutton"
            schX={-5}
            schY={0.7}
            schRotation={rotation}
          />
        </board>,
      )
      await circuit.renderUntilSettled()
      const circuitJson = circuit.getCircuitJson() as CircuitJson
      const component = circuitJson.find(
        (element) => element.type === "schematic_component",
      )!
      const artwork = symbols[component.symbol_name as keyof typeof symbols]!
      const originalCenter = { ...artwork.center }
      const converter = new CircuitJsonToKicadSchConverter(circuitJson)
      converter.runUntilFinished()
      const schematic = parseKicadSch(converter.getOutputString())
      const instance = schematic.symbols[0]!
      const definition = schematic.libSymbols!.symbols.find(
        (symbol) => symbol.libraryId === instance.libraryId,
      )!
      const pins = definition.subSymbols.flatMap((symbol) => symbol.pins)
      const artworkPoints = definition.subSymbols.flatMap((symbol) =>
        symbol.polylines.flatMap((polyline) => polyline.points?.points ?? []),
      )
      const ports = circuitJson.filter(
        (element) => element.type === "schematic_port",
      )
      expect(ports).toHaveLength(2)
      expect(pins).toHaveLength(2)
      for (const port of ports) {
        const expected = applyToPoint(converter.ctx.c2kMatSch!, port.center)
        expect(
          pins.some(
            (pin) =>
              Math.abs(instance.at!.x + pin.at!.x - expected.x) < 1e-4 &&
              Math.abs(instance.at!.y - pin.at!.y - expected.y) < 1e-4,
          ),
        ).toBe(true)
      }
      for (const pin of pins) {
        expect(
          artworkPoints.some(
            (point) =>
              "x" in point &&
              Math.abs(point.x - pin.at!.x) < 1e-4 &&
              Math.abs(point.y - pin.at!.y) < 1e-4,
          ),
        ).toBe(true)
      }
      const firstPort = ports.find((port) => port.pin_number === 1)!
      const firstArtworkPort = artwork.ports.find((port) =>
        port.labels.includes("1"),
      )!
      for (const [key, placeholder] of [
        ["Reference", "{REF}"],
        ["Value", "{VAL}"],
      ]) {
        const primitive = artwork.primitives.find(
          (primitive) =>
            primitive.type === "text" && primitive.text === placeholder,
        )!
        if (primitive.type !== "text") throw new Error("Missing symbol field")
        const expected = applyToPoint(converter.ctx.c2kMatSch!, {
          x: firstPort.center.x + primitive.x - firstArtworkPort.x,
          y: firstPort.center.y + primitive.y - firstArtworkPort.y,
        })
        const property = instance.properties.find(
          (property) => property.key === key,
        )!
        expect(property.at!.x).toBeCloseTo(expected.x, 4)
        expect(property.at!.y).toBeCloseTo(expected.y, 4)
      }
      expect(artwork.center).toEqual(originalCenter)
    }
  }
})
