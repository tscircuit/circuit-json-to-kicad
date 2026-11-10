import { expect, spyOn, test } from "bun:test"
import { $ } from "bun"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { applyToPoint } from "transformation-matrix"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"

const Box = ({
  side,
  spacing,
  height = 0.6,
}: {
  side: "left" | "right"
  spacing: number
  height?: number
}) => (
  <symbol name={`Box_${side}`}>
    <schematicrect width={1} height={height} />
    <port
      name="1"
      pinNumber={1}
      direction={side}
      schX={side === "left" ? -0.5 : 0.5}
      schY={spacing / 2}
    />
    <port
      name="2"
      pinNumber={2}
      direction={side}
      schX={side === "left" ? -0.5 : 0.5}
      schY={-spacing / 2}
    />
  </symbol>
)

async function expectNoElectricalWarnings(schematic: string) {
  const directory = await mkdtemp(join(tmpdir(), "connection-grid-"))
  try {
    const schematicPath = join(directory, "grid.kicad_sch")
    const reportPath = join(directory, "erc.json")
    await writeFile(schematicPath, schematic)
    await $`kicad-cli sch erc --format json --output ${reportPath} ${schematicPath}`.quiet()
    const report: { sheets: { violations: { type: string }[] }[] } = JSON.parse(
      await readFile(reportPath, "utf8"),
    )
    // Embedded Custom symbols need no installed library. Every electrical
    // check, including off-grid and no-connect checks, must pass.
    expect(
      report.sheets
        .flatMap((sheet) => sheet.violations)
        .filter((violation) => violation.type !== "lib_symbol_issues")
        .map((violation) => violation.type),
    ).toEqual([])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function createConnectedBoxes(spacing: number, height = 0.6) {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <chip
        name="U1"
        schX={-2}
        symbol={<Box side="right" spacing={spacing} height={height} />}
      />
      <chip
        name="U2"
        schX={2}
        symbol={<Box side="left" spacing={spacing} height={height} />}
      />
      <chip
        name="U3"
        schX={2}
        schY={2}
        symbol={<Box side="left" spacing={spacing} height={height} />}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  circuitJson.push({
    type: "source_net",
    source_net_id: "net_a",
    name: "A",
    member_source_group_ids: [],
  })
  const components = circuitJson.filter(
    (element) => element.type === "schematic_component",
  )
  const ports = circuitJson.filter(
    (element) => element.type === "schematic_port",
  )
  const branchPort = ports.find(
    (port) =>
      port.schematic_component_id === components[2]!.schematic_component_id &&
      port.pin_number === 1,
  )!
  const unusedPort = ports.find(
    (port) =>
      port.schematic_component_id === components[2]!.schematic_component_id &&
      port.pin_number === 2,
  )!
  const unusedSourcePort = circuitJson.find(
    (element) =>
      element.type === "source_port" &&
      element.source_port_id === unusedPort.source_port_id,
  )!
  if (unusedSourcePort.type === "source_port")
    unusedSourcePort.do_not_connect = true
  for (const pin of [1, 2]) {
    const from = ports.find(
      (port) =>
        port.schematic_component_id === components[0]!.schematic_component_id &&
        port.pin_number === pin,
    )!
    const to = ports.find(
      (port) =>
        port.schematic_component_id === components[1]!.schematic_component_id &&
        port.pin_number === pin,
    )!
    const junction = { x: 0, y: from.center.y }
    circuitJson.push({
      type: "schematic_trace",
      schematic_trace_id: `trace_${pin}`,
      source_trace_id: `source_trace_${pin}`,
      edges:
        pin === 1
          ? [
              { from: from.center, to: junction },
              { from: junction, to: to.center },
              { from: junction, to: { x: 0, y: branchPort.center.y } },
              { from: { x: 0, y: branchPort.center.y }, to: branchPort.center },
            ]
          : [{ from: from.center, to: to.center }],
      junctions: pin === 1 ? [junction] : [],
    })
    if (pin === 1)
      circuitJson.push({
        type: "schematic_net_label",
        schematic_net_label_id: "label_a",
        source_net_id: "net_a",
        text: "A",
        center: junction,
        anchor_position: junction,
        anchor_side: "left",
      })
    else {
      circuitJson.push(
        {
          type: "source_trace",
          source_trace_id: "source_trace_2",
          connected_source_port_ids: [from.source_port_id, to.source_port_id],
          connected_source_net_ids: [],
        },
        {
          type: "schematic_text",
          schematic_text_id: "inline_b",
          source_trace_id: "source_trace_2",
          text: "B",
          position: junction,
          anchor: "left",
          rotation: 0,
          font_size: 0.2,
          color: "black",
        },
      )
    }
  }
  return circuitJson
}

for (const spacing of [0.4, 0.01]) {
  test(`custom symbol grid placement preserves two separate nets at ${spacing} pin spacing`, async () => {
    const circuitJson = await createConnectedBoxes(spacing)
    const converter = new CircuitJsonToKicadSchConverter(circuitJson)
    converter.runUntilFinished()
    const schematic = converter.getOutput()
    const definitions = schematic.libSymbols!.symbols
    expect(definitions).toHaveLength(2)
    // U2 and U3 still share one library definition at different sheet positions.
    expect(schematic.symbols[1]!.libraryId).toBe(
      schematic.symbols[2]!.libraryId,
    )
    for (const symbol of schematic.symbols) {
      const datasheet = symbol.properties.find(
        (property) => property.key === "Datasheet",
      )!
      expect(datasheet.at!.x).toBe(symbol.at!.x)
      expect(datasheet.at!.y).toBe(symbol.at!.y)
    }
    for (const definition of definitions) {
      const body = definition.subSymbols.flatMap((unit) => unit.rectangles)[0]!
      expect(body.getString()).toContain("(start -7.5 -4.5)")
      expect(body.getString()).toContain("(end 7.5 4.5)")
      const pins = definition.subSymbols.flatMap((unit) => unit.pins)
      for (const pin of pins) {
        expect(Math.abs(pin.at!.x) - pin.length!).toBeCloseTo(7.5, 4)
      }
      expect(Math.abs(pins[0]!.at!.y - pins[1]!.at!.y)).toBeGreaterThanOrEqual(
        1.27,
      )
    }
    await Bun.write(
      `./debug-output/connection-grid-${spacing}.kicad_sch`,
      converter.getOutputString(),
    )
    const nets = await exportNativeSchematicNets(circuitJson)
    expect(
      nets
        .filter((net) => net.pins.length > 1)
        .map((net) => net.pins)
        .sort(),
    ).toEqual([
      ["U1.1", "U2.1", "U3.1"],
      ["U1.2", "U2.2"],
    ])
    expect(nets.find((net) => net.name === "A")?.pins).toEqual([
      "U1.1",
      "U2.1",
      "U3.1",
    ])
    expect(
      nets.find((net) => net.name === "unconnected-(U3-Pad2)")?.pins,
    ).toEqual(["U3.2"])
    expect(nets.find((net) => net.name === "/B")?.pins).toEqual([
      "U1.2",
      "U2.2",
    ])

    await expectNoElectricalWarnings(converter.getOutputString())
  }, 30_000)
}

test("reports a symbol too small for distinct grid pins and preserves the authored layout", async () => {
  const circuitJson = await createConnectedBoxes(0.01, 0.01)
  const warning = spyOn(console, "warn").mockImplementation(() => {})
  try {
    const converter = new CircuitJsonToKicadSchConverter(circuitJson)
    converter.runUntilFinished()
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("without changing symbol bodies"),
    )
    expect(converter.ctx.schematicConnectionGrid).toBeUndefined()
    const components = circuitJson.filter(
      (element) => element.type === "schematic_component",
    )
    const schematic = converter.getOutput()
    for (const [index, component] of components.entries()) {
      const original = applyToPoint(converter.ctx.c2kMatSch!, component.center)
      expect(schematic.symbols[index]!.at!.x).toBe(original.x)
      expect(schematic.symbols[index]!.at!.y).toBe(original.y)
    }
    expect(
      (await exportNativeSchematicNets(circuitJson))
        .filter((net) => net.pins.length > 1)
        .map((net) => net.pins)
        .sort(),
    ).toEqual([
      ["U1.1", "U2.1", "U3.1"],
      ["U1.2", "U2.2"],
    ])
  } finally {
    warning.mockRestore()
  }
}, 30_000)

for (const stemLength of [0, 0.2]) {
  test(`keeps circular artwork and attaches pins on all four sides with stem length ${stemLength}`, async () => {
    const circuit = new Circuit()
    circuit.pcbDisabled = true
    const radius = 0.5 + stemLength
    circuit.add(
      <board>
        <chip
          name="U1"
          schX={0.1234567}
          schY={0.2345678}
          symbol={
            <symbol name="Circle">
              <schematiccircle center={{ x: 0, y: 0 }} radius={0.5} />
              <port
                name="1"
                pinNumber={1}
                direction="right"
                schX={radius}
                schY={0}
                schStemLength={stemLength}
              />
              <port
                name="2"
                pinNumber={2}
                direction="left"
                schX={-radius}
                schY={0}
                schStemLength={stemLength}
              />
              <port
                name="3"
                pinNumber={3}
                direction="up"
                schX={0}
                schY={radius}
                schStemLength={stemLength}
              />
              <port
                name="4"
                pinNumber={4}
                direction="down"
                schX={0}
                schY={-radius}
                schStemLength={stemLength}
              />
            </symbol>
          }
        />
      </board>,
    )
    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson()
    for (const element of circuitJson) {
      if (element.type === "source_port") element.do_not_connect = true
    }
    const converter = new CircuitJsonToKicadSchConverter(circuitJson)
    converter.runUntilFinished()
    expect(converter.ctx.schematicConnectionGrid).toBeDefined()
    const units = converter.getOutput().libSymbols!.symbols[0]!.subSymbols
    expect(units.flatMap((unit) => unit.circles)[0]!.getString()).toContain(
      "(radius 7.5)",
    )
    const pins = units.flatMap((unit) => unit.pins)
    expect(pins).toHaveLength(4)
    if (stemLength === 0) {
      for (const pin of pins) {
        expect(Math.hypot(pin.at!.x, pin.at!.y) - pin.length!).toBeCloseTo(
          7.5,
          4,
        )
      }
    } else {
      const stems = units.flatMap((unit) => unit.polylines)
      expect(stems).toHaveLength(4)
      for (const stem of stems) {
        const endpoints = stem.points!.points.map((point) => {
          if (!("x" in point) || !("y" in point))
            throw new Error("Unexpected stem point")
          return { x: point.x, y: point.y }
        })
        expect(
          endpoints.some((point) =>
            pins.some((pin) => pin.at!.x === point.x && pin.at!.y === point.y),
          ),
        ).toBe(true)
        expect(
          Math.min(...endpoints.map((point) => Math.hypot(point.x, point.y))),
        ).toBeCloseTo(7.5, 4)
      }
    }
    await expectNoElectricalWarnings(converter.getOutputString())
  }, 30_000)
}

test("reports diagonal routing without partially moving the circuit", async () => {
  const circuitJson = await createConnectedBoxes(0.4)
  const trace = circuitJson.find(
    (element) => element.type === "schematic_trace",
  )!
  if (trace.type !== "schematic_trace") throw new Error("Missing trace")
  const edge = trace.edges[0]!
  const corner = { x: edge.to.x - 0.1, y: edge.to.y + 0.1 }
  trace.edges.splice(
    0,
    1,
    { from: edge.from, to: corner },
    { from: corner, to: edge.to },
  )
  const warning = spyOn(console, "warn").mockImplementation(() => {})
  try {
    const converter = new CircuitJsonToKicadSchConverter(circuitJson)
    converter.runUntilFinished()
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("diagonal schematic wires"),
    )
    expect(converter.ctx.schematicConnectionGrid).toBeUndefined()
    expect(
      (await exportNativeSchematicNets(circuitJson))
        .filter((net) => net.pins.length > 1)
        .map((net) => net.pins)
        .sort(),
    ).toEqual([
      ["U1.1", "U2.1", "U3.1"],
      ["U1.2", "U2.2"],
    ])
  } finally {
    warning.mockRestore()
  }
}, 30_000)
