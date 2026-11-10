import { expect, spyOn, test } from "bun:test"
import { $ } from "bun"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"

async function readErc(schematic: string) {
  const directory = await mkdtemp(join(tmpdir(), "builtin-grid-"))
  try {
    const input = join(directory, "circuit.kicad_sch")
    const report = join(directory, "erc.json")
    await writeFile(input, schematic)
    await $`kicad-cli sch erc --format json --output ${report} ${input}`.quiet()
    const result: { sheets: { violations: { type: string }[] }[] } = JSON.parse(
      await readFile(report, "utf8"),
    )
    return result.sheets
      .flatMap((sheet) => sheet.violations)
      .map((violation) => violation.type)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

for (const rotation of [0, 90]) {
  test(`built-in resistor, capacitor, and chip pins are on grid at ${rotation} degrees`, async () => {
    const circuit = new Circuit()
    circuit.pcbDisabled = true
    circuit.add(
      <board routingDisabled>
        <resistor name="R1" resistance="1k" schX={-3} schRotation={rotation} />
        <capacitor
          name="C1"
          capacitance="100nF"
          schX={3}
          schRotation={rotation}
        />
        <chip
          name="U1"
          schY={3}
          schRotation={rotation}
          pinLabels={{ pin1: "A", pin2: "B", pin3: "C", pin4: "D" }}
        />
      </board>,
    )
    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson()
    expect(
      circuitJson.some((element) => element.type === "schematic_symbol"),
    ).toBe(false)
    for (const element of circuitJson) {
      if (element.type === "source_port") element.do_not_connect = true
    }
    const converter = new CircuitJsonToKicadSchConverter(circuitJson)
    converter.runUntilFinished()
    expect(converter.ctx.schematicConnectionGrid).toBeDefined()
    expect(
      (await readErc(converter.getOutputString())).filter(
        (type) => type !== "lib_symbol_issues",
      ),
    ).toEqual([])
    expect(
      (await exportNativeSchematicNets(circuitJson))
        .flatMap((net) => net.pins)
        .sort(),
    ).toEqual(["C1.1", "C1.2", "R1.1", "R1.2", "U1.1", "U1.2", "U1.3", "U1.4"])
  }, 30_000)
}

test("built-in resistor/capacitor networks keep their separate nets and inline labels", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <resistor name="R1" resistance="1k" schX={-2} schY={1} />
      <capacitor name="C1" capacitance="100nF" schX={2} schY={1} />
      <resistor name="R2" resistance="2k" schX={-2} schY={-1} />
      <capacitor name="C2" capacitance="1uF" schX={2} schY={-1} />
      <trace name="A" from=".R1 > .pin2" to=".C1 > .pin1" />
      <trace name="B" from=".R2 > .pin2" to=".C2 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const ports = circuitJson.filter(
    (element) => element.type === "schematic_port",
  )
  for (const element of circuitJson) {
    if (
      element.type === "source_port" &&
      !ports.find((port) => port.source_port_id === element.source_port_id)
        ?.is_connected
    )
      element.do_not_connect = true
  }
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  expect(converter.ctx.schematicConnectionGrid).toBeDefined()
  expect(
    (await readErc(converter.getOutputString())).filter(
      (type) => type !== "lib_symbol_issues",
    ),
  ).toEqual([])
  expect(
    (await exportNativeSchematicNets(circuitJson)).filter(
      (net) => net.pins.length > 1,
    ),
  ).toEqual([
    { name: "/A", pins: ["C1.1", "R1.2"] },
    { name: "/B", pins: ["C2.1", "R2.2"] },
  ])
}, 30_000)

test("built-in power and ground symbols attach on grid and retain their nets", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <net name="VDD" isPowerNet />
      <net name="GND" isGroundNet />
      <capacitor
        name="C1"
        capacitance="100nF"
        schX={-3}
        connections={{ pin1: "net.VDD", pin2: "net.GND" }}
      />
      <capacitor
        name="C2"
        capacitance="100nF"
        schX={3}
        connections={{ pin1: "net.VDD", pin2: "net.GND" }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  expect(converter.ctx.schematicConnectionGrid).toBeDefined()
  // This passive fixture has no power source; that existing ERC warning is expected.
  expect(
    (await readErc(converter.getOutputString())).filter(
      (type) => !["lib_symbol_issues", "power_pin_not_driven"].includes(type),
    ),
  ).toEqual([])
  expect(await exportNativeSchematicNets(circuitJson)).toEqual([
    { name: "GND", pins: ["C1.2", "C2.2"] },
    { name: "VDD", pins: ["C1.1", "C2.1"] },
  ])
}, 30_000)

test("a drawing-only sheet does not report a grid-placement failure", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board>
      <schematicline x1={0} y1={0} x2={1} y2={0.5} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const warning = spyOn(console, "warn").mockImplementation(() => {})
  try {
    const converter = new CircuitJsonToKicadSchConverter(
      circuit.getCircuitJson(),
    )
    converter.runUntilFinished()
    expect(warning).not.toHaveBeenCalled()
    expect(converter.getOutput().polylines).toHaveLength(1)
  } finally {
    warning.mockRestore()
  }
})

test("an already aligned chip keeps its origin, body, pins, and no-connect markers", async () => {
  const circuit = new Circuit()
  circuit.pcbDisabled = true
  circuit.add(
    <board routingDisabled>
      <chip name="U1" pinLabels={{ pin1: "A", pin2: "B" }} />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  // Author a generic chip whose 6 mm stems end on the grid after the existing
  // 15 mm/unit conversion. Its body edges need not be on the connection grid.
  for (const element of circuitJson) {
    if (element.type === "schematic_component") {
      element.center = { x: 0, y: 0 }
      element.size = { width: 3.24 / 15, height: 7.62 / 15 }
    } else if (element.type === "schematic_port") {
      element.center = {
        x: element.pin_number === 1 ? -7.62 / 15 : 7.62 / 15,
        y: 0,
      }
    } else if (element.type === "source_port") {
      element.do_not_connect = true
    }
  }
  const converter = new CircuitJsonToKicadSchConverter(circuitJson, {
    schematicSheets: [{ circuitOrigin: { x: 127, y: 101.6 } }],
  })
  converter.runUntilFinished()
  const schematic = converter.getOutput()
  expect(schematic.symbols[0]!.at!.x).toBe(127)
  expect(schematic.symbols[0]!.at!.y).toBe(101.6)
  const units = schematic.libSymbols!.symbols[0]!.subSymbols
  expect(
    units
      .flatMap((unit) => unit.pins)
      .map((pin) => [pin.at!.x, pin.at!.y, pin.length]),
  ).toEqual([
    [-7.62, 0, 6],
    [7.62, 0, 6],
  ])
  const body = units.flatMap((unit) => unit.polylines)[0]!.getString()
  expect(body).toContain("(xy -1.62 -3.81)")
  expect(body).toContain("(xy 1.62 3.81)")
  expect(
    schematic.noConnects.map((marker) => [marker.at!.x, marker.at!.y]),
  ).toEqual([
    [119.38, 101.6],
    [134.62, 101.6],
  ])
  const grid = converter.ctx.schematicConnectionGrid!
  for (const [original, placed] of [...grid.x, ...grid.y])
    expect(placed).toBe(original)
  expect(
    (await readErc(converter.getOutputString())).filter(
      (type) => type !== "lib_symbol_issues",
    ),
  ).toEqual([])
}, 30_000)
