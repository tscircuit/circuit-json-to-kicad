import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { getSymbolArcAttachment } from "lib/schematic/stages/utils/getSymbolArcAttachment"
import { toSchematicInternalUnits } from "lib/schematic/stages/utils/schematicCoordinates"
import { SymbolArcStart } from "kicadts"
import {
  applyToPoint,
  compose,
  rotateDEG,
  translate,
} from "transformation-matrix"
import { readSchematicErc } from "../fixtures/read-schematic-erc"
import { takeKicadSnapshot } from "../fixtures/take-kicad-snapshot"

test("rounding a shallow arc preserves a contact between its defining points", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  const contactAngle = (21 * Math.PI) / 180
  circuit.add(
    <board routingDisabled>
      <chip
        name="U1"
        noConnect={["pin1"]}
        symbol={
          <symbol name="RoundedArcContact">
            <schematicarc
              center={{ x: 0, y: 0 }}
              radius={0.5}
              startAngleDegrees={0}
              endAngleDegrees={30}
            />
            <port
              name="1"
              pinNumber={1}
              direction="right"
              schX={0.5 * Math.cos(contactAngle)}
              schY={0.5 * Math.sin(contactAngle)}
            />
          </symbol>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadSchConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const units = converter.getOutput().libSymbols!.symbols[0]!.subSymbols
  const arc = units.flatMap((unit) => unit.arcs)[0]!
  const start = arc
    .getChildren()
    .find((child) => child instanceof SymbolArcStart)!
  // A real 0.015 mm gap must still be rejected; only rounding uncertainty is
  // allowed, independently of the much larger 1.27 mm connection grid.
  expect(
    getSymbolArcAttachment({
      arc,
      point: {
        x: toSchematicInternalUnits(
          start.x - 7.5 + 7.515 * Math.cos(contactAngle),
        ),
        y: toSchematicInternalUnits(start.y + 7.515 * Math.sin(contactAngle)),
      },
      direction: { x: 0, y: 1 },
    }),
  ).toBeUndefined()
  const pin = units.flatMap((unit) => unit.pins)[0]!
  // A rejected attachment leaves the default 0.01 mm stem floating off the arc.
  expect(pin.length).toBeGreaterThan(0.01)
  const contact = applyToPoint(
    compose(translate(pin.at!.x, pin.at!.y), rotateDEG(pin.at!.angle!)),
    { x: pin.length!, y: 0 },
  )
  // The source radius is 0.5 * 15 mm; the 0-degree start locates its center.
  expect(
    Math.hypot(contact.x - (start.x - 7.5), contact.y - start.y),
  ).toBeCloseTo(7.5, 3)
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
