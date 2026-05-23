import { expect, test } from "bun:test"
import { KicadSch } from "kicadts"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro11 off-grid wire endpoints miss exported KiCad pin anchors", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board>
      <chip
        name="U1"
        footprint="soic2"
        schX={0.13}
        schY={0.17}
        symbol={
          <symbol name="OffGridChip" width={2} height={1}>
            <port
              name="pin1"
              pinNumber={1}
              direction="left"
              schX={-0.9}
              schY={0}
            />
            <port
              name="pin2"
              pinNumber={2}
              direction="right"
              schX={0.9}
              schY={0}
            />
          </symbol>
        }
        connections={{ pin2: "U2.pin1" }}
      />
      <chip
        name="U2"
        footprint="soic2"
        schX={4.31}
        schY={0.22}
        symbol={
          <symbol name="OffGridChip" width={2} height={1}>
            <port
              name="pin1"
              pinNumber={1}
              direction="left"
              schX={-0.9}
              schY={0}
            />
            <port
              name="pin2"
              pinNumber={2}
              direction="right"
              schX={0.9}
              schY={0}
            />
          </symbol>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  const kicadSch = KicadSch.parse(output)[0] as KicadSch
  const wirePoints = kicadSch.wires.flatMap(
    (wire) => wire.points?.points ?? [],
  ) as Array<{ x: number; y: number }>
  expect(wirePoints.length).toBeGreaterThan(0)

  const symbolsByRef = new Map(
    kicadSch.symbols.map((symbol: any) => [
      symbol.properties?.[0]?.value,
      symbol,
    ]),
  )
  const u1 = symbolsByRef.get("U1")
  const u2 = symbolsByRef.get("U2")

  expect(u1).toBeDefined()
  expect(u2).toBeDefined()

  const wireStart = wirePoints[0]!
  const wireEnd = wirePoints[wirePoints.length - 1]!
  const expectedStart = { x: u1.at.x + 15, y: u1.at.y }
  const expectedEnd = { x: u2.at.x - 15, y: u2.at.y }

  expect(wireStart.x - expectedStart.x).toBeCloseTo(-1.5)
  expect(wireStart.y - expectedStart.y).toBeCloseTo(0)
  expect(wireEnd.x - expectedEnd.x).toBeCloseTo(1.5)
  expect(wireEnd.y - expectedEnd.y).toBeCloseTo(0)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })

  expect(kicadSnapshot.exitCode).toBe(0)
  expect(
    kicadSnapshot.generatedFileContent["temp_file.png"]!,
  ).toMatchPngSnapshot(import.meta.path)
}, 15_000)
