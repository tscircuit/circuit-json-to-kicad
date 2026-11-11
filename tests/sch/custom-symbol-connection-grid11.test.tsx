import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import {
  applyToPoint,
  compose,
  rotateDEG,
  translate,
} from "transformation-matrix"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"
import { readSchematicErc } from "../fixtures/read-schematic-erc"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"

test("clockwise major arcs keep contacts on their drawn branches and preserve wiring", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <chip
        name="U1"
        schX={-2}
        noConnect={["pin2", "pin3"]}
        symbol={
          <symbol name="ClockwiseMajorArc">
            <schematicarc
              center={{ x: 0, y: 0 }}
              radius={0.5}
              startAngleDegrees={90}
              endAngleDegrees={180}
              direction="clockwise"
            />
            <port
              name="1"
              pinNumber={1}
              direction="right"
              schX={0.5}
              schY={0}
            />
            <port
              name="2"
              pinNumber={2}
              direction="left"
              schX={-0.4}
              schY={-0.3}
            />
            <port
              name="3"
              pinNumber={3}
              direction="down"
              schX={0}
              schY={-0.5}
            />
          </symbol>
        }
      />
      <chip name="U2" schX={2} pinLabels={{ pin1: "INPUT" }} />
      <trace from="U1.pin1" to="U2.INPUT" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const units = converter.getOutput().libSymbols!.symbols[0]!.subSymbols
  const pins = units.flatMap((unit) => unit.pins)
  expect(pins).toHaveLength(3)
  for (const pin of pins) {
    const { x, y, angle } = pin.at!
    const contact = applyToPoint(compose(translate(x, y), rotateDEG(angle!)), {
      x: pin.length!,
      y: 0,
    })
    expect(Math.hypot(contact.x, contact.y)).toBeCloseTo(7.5, 3)
    // The top-left quadrant is the gap in this 270-degree clockwise arc.
    expect(contact.x < 0 && contact.y > 0).toBe(false)
    expect(pin.length).toBeGreaterThanOrEqual(0)
  }
  expect(
    (await exportNativeSchematicNets(circuitJson))
      .filter((net) => net.pins.length > 1)
      .map((net) => net.pins),
  ).toEqual([["U1.1", "U2.1"]])
  expect(
    (await readSchematicErc(converter.getOutputString())).filter(
      (type) => type !== "lib_symbol_issues",
    ),
  ).toEqual([])
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })
  await expect(
    snapshot.generatedFileContent["temp_file.png"]!,
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
