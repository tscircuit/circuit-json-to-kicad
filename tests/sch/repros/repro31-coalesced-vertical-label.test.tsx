import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CircuitJson } from "circuit-json"
import { parseKicadSch, type Xy } from "kicadts"
import { CircuitJsonToKicadSchConverter } from "lib"
import "tscircuit"
import { Circuit } from "tscircuit-latest"

test("coalesced vertical-wire labels anchor on KiCad's lower endpoint", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board
      width="80mm"
      height="40mm"
      routingDisabled
      schTraceAutoLabelEnabled
      schMaxTraceDistance={2}
    >
      <group subcircuit name="vertical_signal">
        <resistor
          name="R1"
          resistance="1k"
          footprint="0402"
          schX={0}
          schY={0}
          schRotation={90}
        />
        <resistor
          name="R2"
          resistance="1k"
          footprint="0402"
          schX={0}
          schY={5}
          schRotation={90}
        />
        <resistor
          name="R3"
          resistance="1k"
          footprint="0402"
          schX={20}
          schY={0}
          schRotation={90}
        />
        <resistor
          name="R4"
          resistance="1k"
          footprint="0402"
          schX={20}
          schY={5}
          schRotation={90}
        />
        <trace from=".R1 > .pin2" to="net.SIGNAL" />
        <trace from=".R2 > .pin1" to="net.SIGNAL" />
        <trace from=".R1 > .pin2" to=".R2 > .pin1" />
        <trace from=".R3 > .pin2" to="net.SIGNAL" />
        <trace from=".R4 > .pin1" to="net.SIGNAL" />
        <trace from=".R3 > .pin2" to=".R4 > .pin1" />
      </group>
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson() as CircuitJson
  const byType = <T extends CircuitJson[number]["type"]>(type: T) =>
    circuitJson.filter(
      (element): element is Extract<CircuitJson[number], { type: T }> =>
        element.type === type,
    )
  const net = byType("source_net").find((element) => element.name === "SIGNAL")
  const components = byType("source_component")
  const ports = byType("source_port")
  const sourceTraces = byType("source_trace")
  const syntheticWires = byType("schematic_trace").filter((trace) =>
    trace.source_trace_id?.startsWith("schematic_port_"),
  )
  expect(net).toBeDefined()
  expect(components.map((component) => component.name).sort()).toEqual([
    "R1",
    "R2",
    "R3",
    "R4",
  ])
  expect(syntheticWires).toHaveLength(2)
  for (const refPin of [
    ["R1", 2],
    ["R2", 1],
    ["R3", 2],
    ["R4", 1],
  ] as const) {
    const component = components.find((item) => item.name === refPin[0])!
    const port = ports.find(
      (item) =>
        item.source_component_id === component.source_component_id &&
        item.pin_number === refPin[1],
    )!
    expect(
      sourceTraces.some(
        (trace) =>
          trace.connected_source_net_ids.includes(net!.source_net_id) &&
          trace.connected_source_port_ids.includes(port.source_port_id),
      ),
    ).toBe(true)
  }
  for (const wire of syntheticWires) {
    expect(
      wire.edges.some(
        (edge) => edge.from.x === edge.to.x && edge.from.y !== edge.to.y,
      ),
    ).toBe(true)
  }

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const parsedSchematic = parseKicadSch(converter.getOutputString())
  const signalLabels = parsedSchematic.labels.filter(
    (label) => label.value === "SIGNAL",
  )
  expect(signalLabels).toHaveLength(2)
  for (const label of signalLabels) {
    const matchingWire = parsedSchematic.wires.find((wire) => {
      const points = wire.points?.points.filter(
        (point): point is Xy => "x" in point,
      )
      return (
        points?.length === 2 &&
        points[0]!.x === points[1]!.x &&
        points[0]!.x === label.at!.x
      )
    })
    expect(matchingWire).toBeDefined()
    const [first, second] = matchingWire!.points!.points.filter(
      (point): point is Xy => "x" in point,
    )
    // KiCad's y-axis is flipped from Circuit coordinates, so the physically
    // lower endpoint of the rendered wire has the larger KiCad y coordinate.
    expect(label.at!.y).toBeCloseTo(Math.max(first!.y, second!.y), 6)
    expect(label.at!.angle).toBe(90)
    expect(label.effects?.justify?.horizontal).toBe("left")
    expect(label.effects?.justify?.vertical).toBe("bottom")
  }
  await Bun.write(
    "./debug-output/repro31-coalesced-vertical-label.kicad_sch",
    converter.getOutputString(),
  )
  const tempDir = await mkdtemp(join(tmpdir(), "coalesced-vertical-label-"))
  try {
    const schematicPath = join(tempDir, "vertical.kicad_sch")
    const netlistPath = join(tempDir, "vertical.xml")
    await writeFile(schematicPath, converter.getOutputString())
    const result = Bun.spawnSync([
      "kicad-cli",
      "sch",
      "export",
      "netlist",
      "--format",
      "kicadxml",
      "--output",
      netlistPath,
      schematicPath,
    ])
    expect(result.exitCode).toBe(0)
    const netlist = await readFile(netlistPath, "utf8")
    const netPartition = [...netlist.matchAll(/<net\b[^>]*>([\s\S]*?)<\/net>/g)]
      .map(([, body]) =>
        [...body!.matchAll(/<node\b[^>]*ref="([^"]+)"[^>]*pin="([^"]+)"/g)]
          .map(([, ref, pin]) => `${ref}.${pin}`)
          .sort(),
      )
      .filter((members) => members.length > 0)
      .sort((a, b) => a.join(",").localeCompare(b.join(",")))
    expect(
      [...netlist.matchAll(/<comp ref="([^"]+)"/g)]
        .map(([, ref]) => ref)
        .sort(),
    ).toEqual(["R1", "R2", "R3", "R4"])
    expect(netPartition).toEqual([
      ["R1.1"],
      ["R1.2", "R2.1", "R3.2", "R4.1"],
      ["R2.2"],
      ["R3.1"],
      ["R4.2"],
    ])
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}, 120_000)
