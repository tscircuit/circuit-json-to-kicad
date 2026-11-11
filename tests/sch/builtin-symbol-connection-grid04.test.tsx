import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"
import { readSchematicErc } from "../fixtures/read-schematic-erc"
import { Xy } from "kicadts"

test("a fractional origin preserves already aligned pins, wiring, labels, and no-connects", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <chip
        name="U1"
        schX={0}
        schY={0}
        schWidth={1.97 / 15}
        schHeight={7.62 / 15}
        pinLabels={{ pin1: "A", pin2: "B" }}
        noConnect={["A"]}
        schPinArrangement={{
          leftSide: { pins: ["A"], direction: "top-to-bottom" },
          rightSide: { pins: ["B"], direction: "top-to-bottom" },
        }}
      />
      <chip
        name="U2"
        schX={1.27}
        schY={0}
        schWidth={1.97 / 15}
        schHeight={7.62 / 15}
        pinLabels={{ pin1: "A", pin2: "B" }}
        noConnect={["B"]}
        schPinArrangement={{
          leftSide: { pins: ["A"], direction: "top-to-bottom" },
          rightSide: { pins: ["B"], direction: "top-to-bottom" },
        }}
      />
      <trace from="U1.B" to="U2.A" />
      <netlabel
        net="SIGNAL"
        connectsTo={["U1.B", "U2.A"]}
        schX={1.27 - 6.985 / 15}
        schY={0}
        anchorSide="left"
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const options = {
    schematicSheets: [{ circuitOrigin: { x: 120.015, y: 101.6 } }],
  }
  const converter = new CircuitJsonToKicadSchConverter(circuitJson, options)
  converter.runUntilFinished()
  expect(converter.ctx.schematicConnectionGrid).toBeDefined()
  const schematic = converter.getOutput()
  const origin = schematic.symbols[0]!.at!
  const pins = schematic.libSymbols!.symbols[0]!.subSymbols.flatMap(
    (unit) => unit.pins,
  )
  expect(pins.map((pin) => origin.x + pin.at!.x)).toEqual([113.03, 127])
  const wire = schematic.wires[0]!.points!.points
  expect(
    wire.map((point) => {
      if (!(point instanceof Xy)) throw new Error("Expected wire endpoint")
      return [point.x, point.y]
    }),
  ).toEqual([
    [127, 101.6],
    [132.08, 101.6],
  ])
  expect(schematic.globalLabels[0]!.at).toMatchObject({ x: 132.08, y: 101.6 })
  expect(
    schematic.noConnects.map((marker) => [marker.at!.x, marker.at!.y]),
  ).toEqual([
    [113.03, 101.6],
    [146.05, 101.6],
  ])
  expect(
    (await readSchematicErc(converter.getOutputString())).filter(
      (type) => type !== "lib_symbol_issues",
    ),
  ).toEqual([])
  expect(
    (await exportNativeSchematicNets(circuitJson, options)).find(
      (net) => net.name === "SIGNAL",
    )?.pins,
  ).toEqual(["U1.2", "U2.1"])
  const snapshot = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "sch",
  })
  await expect(
    snapshot.generatedFileContent["temp_file.png"]!,
  ).toMatchPngSnapshot(import.meta.path)
}, 30_000)
