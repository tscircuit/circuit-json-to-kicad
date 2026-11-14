import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { SymbolArcStart, SymbolArcMid, SymbolArcEnd } from "kicadts"
import {
  applyToPoint,
  compose,
  rotateDEG,
  translate,
} from "transformation-matrix"
import { readSchematicErc } from "../fixtures/read-schematic-erc"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"

test("pins attached directly to an arc stay connected without changing its artwork", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <chip
        name="U1"
        schX={0.1234567}
        schY={0.2345678}
        noConnect={["pin1", "pin2", "pin3"]}
        symbol={
          <symbol name="Arc">
            <schematicarc
              center={{ x: 0, y: 0 }}
              radius={0.5}
              startAngleDegrees={0}
              endAngleDegrees={180}
            />
            <port
              name="1"
              pinNumber={1}
              direction="right"
              schX={0.4}
              schY={0.3}
            />
            <port
              name="2"
              pinNumber={2}
              direction="left"
              schX={-0.5}
              schY={0}
            />
            <port name="3" pinNumber={3} direction="up" schX={0} schY={0.5} />
          </symbol>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const units = converter.getOutput().libSymbols!.symbols[0]!.subSymbols
  const arc = units.flatMap((unit) => unit.arcs)[0]!
  expect(
    arc
      .getChildren()
      .filter(
        (child) =>
          child instanceof SymbolArcStart ||
          child instanceof SymbolArcMid ||
          child instanceof SymbolArcEnd,
      )
      .map((point) => [point.x, point.y]),
  ).toEqual([
    [7.5, -3.75],
    [0, 3.75],
    [-7.5, -3.75],
  ])
  const pins = units.flatMap((unit) => unit.pins)
  expect(pins).toHaveLength(3)
  for (const pin of pins) {
    const { x, y, angle } = pin.at!
    const contact = applyToPoint(compose(translate(x, y), rotateDEG(angle!)), {
      x: pin.length!,
      y: 0,
    })
    expect(Math.hypot(contact.x, contact.y + 3.75)).toBeCloseTo(7.5, 3)
    expect(contact.y).toBeGreaterThanOrEqual(-3.75)
    expect(pin.length).toBeGreaterThanOrEqual(0)
  }
  expect(
    (await readSchematicErc(converter.getOutputString())).filter(
      (type) => type !== "lib_symbol_issues",
    ),
  ).toEqual([])
  expect(
    (await exportNativeSchematicNets(circuitJson))
      .flatMap((net) => net.pins)
      .sort(),
  ).toEqual(["U1.1", "U1.2", "U1.3"])
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })
  await expect(
    snapshot.generatedFileContent["temp_file.png"]!,
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
