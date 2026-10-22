import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import type { ReactElement } from "react"
import { Circuit } from "tscircuit"
import { parseKicadSch } from "kicadts"
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadSchConverter,
} from "lib"
import { exportNativeSchematicNets } from "../fixtures/export-native-schematic-nets"
import physicalBalls from "../fixtures/physical-bga-balls.circuit.json"

async function render(element: ReactElement) {
  const circuit = new Circuit()
  circuit.add(element)
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}

async function expectNativeParity(circuitJson: CircuitJson) {
  const input = JSON.stringify(circuitJson)
  const pcb = new CircuitJsonToKicadPcbConverter(circuitJson)
  pcb.runUntilFinished()
  expect(JSON.stringify(circuitJson)).toBe(input)
  const native = await exportNativeSchematicNets(circuitJson)
  const names = new Map(pcb.getOutput().nets.map((net) => [net.id, net.name]))
  const pinsByNet = new Map<number, Set<string>>()
  for (const footprint of pcb.getOutput().footprints) {
    const reference = footprint.properties.find(
      (p) => p.key === "Reference",
    )!.value
    for (const pad of footprint.fpPads) {
      expect(pad.net?.id).toBeGreaterThan(0)
      expect(pad.net!.name).toBe(names.get(pad.net!.id!))
      const pins = pinsByNet.get(pad.net!.id!) ?? new Set<string>()
      pins.add(`${reference}.${pad.number}`)
      pinsByNet.set(pad.net!.id!, pins)
    }
  }
  const actual = [...pinsByNet].map(([id, pins]) => ({
    name: names.get(id),
    pins: [...pins].sort(),
  }))
  const byName = (
    a: { name: string | undefined },
    b: { name: string | undefined },
  ) => (a.name! < b.name! ? -1 : a.name! > b.name! ? 1 : 0)
  expect(actual.sort(byName)).toEqual(native.sort(byName))

  // Existing labels are allowed. Naming the PCB must never introduce new ones.
  const sch = new CircuitJsonToKicadSchConverter(circuitJson)
  sch.runUntilFinished()
  const sheets = sch
    .getOutputFiles({ schematicFilename: "root.kicad_sch" })
    .map((file) => parseKicadSch(file.content))
  expect(sheets.reduce((sum, sheet) => sum + sheet.labels.length, 0)).toBe(
    circuitJson.filter((e) => e.type === "schematic_text" && e.source_trace_id)
      .length,
  )
  expect(
    sheets.reduce((sum, sheet) => sum + sheet.globalLabels.length, 0),
  ).toBe(
    circuitJson.filter(
      (e) => e.type === "schematic_net_label" && !e.symbol_name,
    ).length,
  )
  return { pcb, native }
}

test("unnamed nets choose descriptive pin names and lexical R10 before R2", async () => {
  const circuit = await render(
    <board width="40mm" height="20mm" routingDisabled schMaxTraceDistance={100}>
      <chip
        name="U1"
        footprint="soic8"
        pinLabels={{ pin1: "FB", pin2: "OUT" }}
        schX={-5}
      />
      <resistor name="R2" resistance="1k" footprint="0603" schX={-1} />
      <resistor name="R10" resistance="1k" footprint="0603" schX={3} />
      <capacitor name="C3" capacitance="100nF" footprint="0603" schX={6} />
      <trace from=".U1 > .FB" to=".R2 > .pin1" />
      <trace from=".R2 > .pin2" to=".R10 > .pin1" />
      <trace from=".R10 > .pin2" to=".C3 > .pin1" />
    </board>,
  )
  const { native } = await expectNativeParity(circuit)
  expect(native).toContainEqual({ name: "Net-(U1-FB)", pins: ["R2.1", "U1.1"] })
  expect(native).toContainEqual({
    name: "Net-(R10-Pad1)",
    pins: ["R10.1", "R2.2"],
  })
}, 30_000)

test("duplicate pin names remain distinct and include their pad number", async () => {
  const circuit = await render(
    <board width="30mm" height="20mm" routingDisabled>
      <chip
        name="U1"
        footprint="soic8"
        pinLabels={{ pin1: "FIRST", pin2: "SECOND" }}
        schX={-3}
      />
      <resistor name="R1" resistance="1k" footprint="0603" schX={2} schY={2} />
      <resistor name="R2" resistance="1k" footprint="0603" schX={2} schY={-2} />
      <trace from=".U1 > .pin1" to=".R1 > .pin1" />
      <trace from=".U1 > .pin2" to=".R2 > .pin1" />
    </board>,
  )
  // Imported symbols can name distinct pins alike without internally joining
  // them. Change only their displayed names, preserving the two source nets.
  for (const port of circuit.filter((e) => e.type === "schematic_port")) {
    if (["FIRST", "SECOND"].includes(port.display_pin_label ?? "")) {
      port.display_pin_label = "IO"
    }
  }
  await expectNativeParity(circuit)
}, 30_000)

test("physical BGA pad names agree with native schematic pins", async () => {
  // Keep the physical package/pin definitions, with each ball left unused.
  const circuit = structuredClone(physicalBalls as CircuitJson).filter(
    (e) =>
      ![
        "source_trace",
        "source_net",
        "pcb_trace",
        "schematic_trace",
        "schematic_net_label",
      ].includes(e.type) && !(e.type === "schematic_text" && e.source_trace_id),
  )
  for (const port of circuit.filter((e) => e.type === "source_port")) {
    delete port.subcircuit_connectivity_map_key
  }
  await expectNativeParity(circuit)
}, 30_000)

test("fanout uses one net for several source traces and is input-order independent", async () => {
  const circuit = await render(
    <board width="30mm" height="20mm" routingDisabled>
      <resistor name="R1" resistance="1k" footprint="0603" schX={-3} />
      <resistor name="R2" resistance="1k" footprint="0603" schX={3} />
      <capacitor name="C1" capacitance="1uF" footprint="0603" schY={3} />
      <trace from=".R1 > .pin2" to=".R2 > .pin1" />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
    </board>,
  )
  const first = await expectNativeParity(circuit)
  const reversed = await expectNativeParity([...circuit].reverse())
  expect(first.native).toEqual(reversed.native)
}, 30_000)

test("power and global labels keep their existing names", async () => {
  await expectNativeParity(
    await render(
      <board width="20mm" height="10mm" routingDisabled>
        <net name="VDD" isPowerNet />
        <net name="GND" isGroundNet />
        <capacitor
          name="C1"
          capacitance="100nF"
          footprint="0603"
          schX={-3}
          connections={{ pin1: "net.VDD", pin2: "net.GND" }}
        />
        <capacitor
          name="C2"
          capacitance="100nF"
          footprint="0603"
          schX={3}
          connections={{ pin1: "net.VDD", pin2: "net.GND" }}
        />
      </board>,
    ),
  )
}, 30_000)

test("existing inline labels use the root sheet path", async () => {
  await expectNativeParity(
    await render(
      <board width="20mm" height="10mm" routingDisabled>
        <schematicsection name="left" />
        <schematicsection name="right" />
        <resistor
          name="R1"
          resistance="1k"
          footprint="0603"
          schSectionName="left"
          schX={-2}
        />
        <resistor
          name="R2"
          resistance="1k"
          footprint="0603"
          schSectionName="right"
          schX={2}
        />
        <trace name="SIGNAL" from=".R1 > .pin2" to=".R2 > .pin1" />
      </board>,
    ),
  )
}, 30_000)

test("same local label on different sheets stays separate and uses display names", async () => {
  const circuit = await render(
    <board width="30mm" height="20mm" routingDisabled>
      <schematicsheet name="first_file" displayName="First / stage" />
      <schematicsheet name="second_file" displayName="Second stage" />
      <group
        subcircuit
        name="First"
        schSheetName="first_file"
        schMaxTraceDistance={1}
      >
        <resistor name="R1" resistance="1k" footprint="0603" schX={-2} />
        <resistor name="R2" resistance="1k" footprint="0603" schX={2} />
        <trace from=".R1 > .pin2" to="net.SIGNAL" />
        <trace from=".R2 > .pin1" to="net.SIGNAL" />
      </group>
      <group
        subcircuit
        name="Second"
        schSheetName="second_file"
        schMaxTraceDistance={1}
      >
        <resistor name="R3" resistance="1k" footprint="0603" schX={-2} />
        <resistor name="R4" resistance="1k" footprint="0603" schX={2} />
        <trace from=".R3 > .pin2" to="net.SIGNAL" />
        <trace from=".R4 > .pin1" to="net.SIGNAL" />
      </group>
    </board>,
  )
  const { native } = await expectNativeParity(circuit)
  expect(native.filter((net) => net.name?.endsWith("SIGNAL"))).toHaveLength(2)
}, 30_000)

test("unnamed nets on child sheets do not acquire a local-label path", async () => {
  await expectNativeParity(
    await render(
      <board width="30mm" height="20mm" routingDisabled>
        <schematicsheet name="Child" displayName="Child">
          <resistor name="R1" resistance="1k" footprint="0603" schX={-2} />
          <capacitor name="C1" capacitance="1uF" footprint="0603" schX={2} />
          <trace from=".R1 > .pin2" to=".C1 > .pin1" />
        </schematicsheet>
      </board>,
    ),
  )
}, 30_000)

test("pin names preserve slashes and KiCad formatting in exported net names", async () => {
  await expectNativeParity(
    await render(
      <board
        width="20mm"
        height="10mm"
        routingDisabled
        schMaxTraceDistance={100}
      >
        <chip
          name="U1"
          footprint="soic8"
          pinLabels={{ pin1: "IN/OUT", pin2: "~{RESET}" }}
          schX={-3}
        />
        <resistor name="R1" resistance="1k" footprint="0603" schX={3} />
        <trace from=".U1 > .pin1" to=".R1 > .pin1" />
      </board>,
    ),
  )
}, 30_000)

test("pad, track, via and pour share the resolved net", async () => {
  const circuit = await render(
    <board width="20mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0603" pcbX={-3} />
      <capacitor name="C1" capacitance="1uF" footprint="0603" pcbX={3} />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
    </board>,
  )
  const trace = circuit.find((e) => e.type === "source_trace")!
  const sourceNetId = "source_net_copper"
  trace.connected_source_net_ids.push(sourceNetId)
  circuit.push(
    {
      type: "source_net",
      source_net_id: sourceNetId,
      name: "copper",
      member_source_group_ids: [],
      subcircuit_connectivity_map_key: trace.subcircuit_connectivity_map_key,
    },
    {
      type: "pcb_via",
      pcb_via_id: "pcb_via_copper",
      x: 0,
      y: 0,
      outer_diameter: 0.6,
      hole_diameter: 0.3,
      layers: ["top", "bottom"],
      source_net_id: sourceNetId,
    },
    {
      type: "pcb_copper_pour",
      pcb_copper_pour_id: "pour",
      shape: "rect",
      layer: "top",
      center: { x: 0, y: 0 },
      width: 5,
      height: 2,
      source_net_id: sourceNetId,
      covered_with_solder_mask: true,
    },
  )
  const { pcb } = await expectNativeParity(circuit)
  const output = pcb.getOutput()
  const net = output.nets.find((net) => net.name === "Net-(C1-Pad1)")!
  expect(output.segments.length).toBeGreaterThan(0)
  expect(output.segments.every((segment) => segment.net?.id === net.id)).toBe(
    true,
  )
  expect(output.vias).toHaveLength(1)
  expect(output.vias[0]!.net?.id).toBe(net.id)
  expect(output.zones).toHaveLength(1)
  expect(output.zones[0]!.net).toBe(net.id)
}, 30_000)

test("PCB-only inputs retain their supplied net names", async () => {
  const circuit = (physicalBalls as CircuitJson).filter(
    (e) => !e.type.startsWith("schematic_"),
  )
  const pcb = new CircuitJsonToKicadPcbConverter(circuit)
  pcb.runUntilFinished()
  expect(
    pcb
      .getOutput()
      .nets.map((net) => net.name)
      .sort(),
  ).toEqual(["", "DATA", "GND"])
})

test("pin-name ranking compares KiCad's escaped names before export", async () => {
  const { native } = await expectNativeParity(
    await render(
      <board
        width="20mm"
        height="10mm"
        routingDisabled
        schMaxTraceDistance={100}
      >
        <chip
          name="U1"
          footprint="soic8"
          pinLabels={{ pin1: "X/Y", pin2: "X_Z" }}
        />
        <trace from=".U1 > .pin1" to=".U1 > .pin2" />
      </board>,
    ),
  )
  expect(native).toContainEqual({
    name: "Net-(U1-X_Z)",
    pins: ["U1.1", "U1.2"],
  })
}, 30_000)

test("global labels connect across child sheets", async () => {
  const { native } = await expectNativeParity(
    await render(
      <board width="30mm" height="20mm" routingDisabled>
        <schematicsheet name="Power" displayName="Power">
          <resistor name="R1" resistance="1k" footprint="0603" />
          <netlabel net="VCC" schX={-2} schY={2} connectsTo=".R1 > .pin1" />
        </schematicsheet>
        <schematicsheet name="Logic" displayName="Logic">
          <resistor name="R2" resistance="1k" footprint="0603" />
          <netlabel net="VCC" schX={-2} schY={2} connectsTo=".R2 > .pin1" />
        </schematicsheet>
      </board>,
    ),
  )
  expect(native).toContainEqual({ name: "VCC", pins: ["R1.1", "R2.1"] })
}, 30_000)

test("a wire with only one pin still gets an unconnected name", async () => {
  const circuit = await render(
    <board width="20mm" height="10mm" routingDisabled>
      <resistor name="R1" resistance="1k" footprint="0603" />
    </board>,
  )
  const port = circuit.filter((e) => e.type === "schematic_port")[0]!
  circuit.push(
    {
      type: "source_trace",
      source_trace_id: "dangling",
      connected_source_port_ids: [port.source_port_id!],
      connected_source_net_ids: [],
    },
    {
      type: "schematic_trace",
      schematic_trace_id: "dangling",
      source_trace_id: "dangling",
      edges: [
        { from: port.center, to: { x: port.center.x - 1, y: port.center.y } },
      ],
      junctions: [],
    },
  )
  const { native } = await expectNativeParity(circuit)
  expect(native.every((net) => net.name?.startsWith("unconnected-("))).toBe(
    true,
  )
}, 30_000)

test("custom symbol pins use their exported names and explicit numbers", async () => {
  const { native } = await expectNativeParity(
    await render(
      <board width="20mm" height="10mm" routingDisabled>
        <chip
          name="U1"
          footprint="0603"
          symbol={
            <symbol>
              <schematicrect width={1} height={1} />
              <port
                name="IN"
                pinNumber={1}
                direction="left"
                schX={-1}
                schY={0}
              />
              <port
                name="OUT"
                pinNumber={2}
                direction="right"
                schX={1}
                schY={0}
              />
            </symbol>
          }
        />
      </board>,
    ),
  )
  expect(native).toContainEqual({
    name: "unconnected-(U1-IN-Pad1)",
    pins: ["U1.1"],
  })
  expect(native).toContainEqual({
    name: "unconnected-(U1-OUT-Pad2)",
    pins: ["U1.2"],
  })
}, 30_000)

test("an explicit global label wins a collision with an automatic name", async () => {
  const circuit = await render(
    <board width="30mm" height="20mm" routingDisabled schMaxTraceDistance={100}>
      <resistor name="R1" resistance="1k" footprint="0603" schX={-3} />
      <capacitor name="C1" capacitance="1uF" footprint="0603" schX={1} />
      <resistor name="R2" resistance="1k" footprint="0603" schX={-3} schY={4} />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      <netlabel net="NAMED" schX={0} schY={4} connectsTo=".R2 > .pin2" />
    </board>,
  )
  // An imported explicit label is allowed to resemble KiCad's automatic names.
  for (const label of circuit.filter((e) => e.type === "schematic_net_label")) {
    label.text = "Net-(C1-Pad1)"
  }
  const { native } = await expectNativeParity(circuit)
  expect(native).toContainEqual({
    name: "Net-(C1-Pad1)_1",
    pins: ["C1.1", "R1.2"],
  })
  expect(native).toContainEqual({ name: "Net-(C1-Pad1)", pins: ["R2.2"] })
}, 30_000)

test("traces without connectivity keys still resolve through source port IDs", async () => {
  const circuit = await render(
    <board width="20mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0603" pcbX={-3} />
      <capacitor name="C1" capacitance="1uF" footprint="0603" pcbX={3} />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
    </board>,
  )
  for (const element of circuit) {
    if ("subcircuit_connectivity_map_key" in element) {
      delete element.subcircuit_connectivity_map_key
    }
  }
  const { pcb } = await expectNativeParity(circuit)
  const net = pcb.getOutput().nets.find((net) => net.name === "Net-(C1-Pad1)")!
  expect(pcb.getOutput().segments.length).toBeGreaterThan(0)
  expect(
    pcb.getOutput().segments.every((segment) => segment.net?.id === net.id),
  ).toBe(true)
}, 30_000)

test("different pin definitions under a shared library name use the resolved variant", async () => {
  const circuit = await render(
    <board width="20mm" height="20mm" routingDisabled>
      <led name="D1" color="red" footprint="0603" schX={-3} />
      <led name="D2" color="red" footprint="0603" schX={3} />
    </board>,
  )
  const source = circuit
    .filter((e) => e.type === "source_component")
    .find((e) => e.name === "D2")!
  const component = circuit
    .filter((e) => e.type === "schematic_component")
    .find((e) => e.source_component_id === source.source_component_id)!
  const [first, second] = circuit
    .filter((e) => e.type === "schematic_port")
    .filter(
      (e) => e.schematic_component_id === component.schematic_component_id,
    )
  ;[first!.center, second!.center] = [second!.center, first!.center]
  ;[first!.facing_direction, second!.facing_direction] = [
    second!.facing_direction,
    first!.facing_direction,
  ]
  const { native } = await expectNativeParity(circuit)
  expect(native).toContainEqual({
    name: "unconnected-(D2-1-Pad2)",
    pins: ["D2.2"],
  })
}, 30_000)

async function renderIndependentConnections() {
  return render(
    <board width="30mm" height="20mm" routingDisabled schMaxTraceDistance={100}>
      <resistor
        name="R1"
        resistance="1k"
        footprint="0603"
        schX={-3}
        schY={-3}
        pcbX={-3}
        pcbY={-3}
      />
      <capacitor
        name="C1"
        capacitance="1uF"
        footprint="0603"
        schX={3}
        schY={-3}
        pcbX={3}
        pcbY={-3}
      />
      <resistor
        name="R2"
        resistance="1k"
        footprint="0603"
        schX={-3}
        schY={3}
        pcbX={-3}
        pcbY={3}
      />
      <capacitor
        name="C2"
        capacitance="1uF"
        footprint="0603"
        schX={3}
        schY={3}
        pcbX={3}
        pcbY={3}
      />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
      <trace from=".R2 > .pin2" to=".C2 > .pin1" />
    </board>,
  )
}

test.each([false, true])(
  "PCB bridges do not join source nets (missing connectivity keys: %s)",
  async (removeKeys) => {
    const circuit = await renderIndependentConnections()
    const traces = circuit.filter((e) => e.type === "source_trace")
    const ports = traces.map(
      (trace) =>
        circuit
          .filter((e) => e.type === "pcb_port")
          .find(
            (port) =>
              port.source_port_id === trace.connected_source_port_ids[0],
          )!,
    )
    circuit.push(
      {
        type: "pcb_trace",
        pcb_trace_id: "misrouted_bridge",
        source_trace_id: traces[0]!.source_trace_id,
        route: [
          {
            route_type: "wire",
            x: ports[0]!.x,
            y: ports[0]!.y,
            layer: "top",
            width: 0.2,
            start_pcb_port_id: ports[0]!.pcb_port_id,
          },
          {
            route_type: "wire",
            x: ports[1]!.x,
            y: ports[1]!.y,
            layer: "top",
            width: 0.2,
            end_pcb_port_id: ports[1]!.pcb_port_id,
          },
        ],
      },
      {
        type: "pcb_via",
        pcb_via_id: "misrouted_via",
        source_trace_id: traces[0]!.source_trace_id,
        pcb_port_ids: ports.map((port) => port.pcb_port_id),
        x: ports[0]!.x,
        y: ports[0]!.y,
        outer_diameter: 0.6,
        hole_diameter: 0.3,
        layers: ["top", "bottom"],
      },
    )
    if (removeKeys)
      for (const element of circuit) {
        if ("subcircuit_connectivity_map_key" in element)
          delete element.subcircuit_connectivity_map_key
      }
    for (const input of [circuit, [...circuit].reverse()]) {
      const { pcb, native } = await expectNativeParity(input)
      expect(native).toContainEqual({
        name: "Net-(C1-Pad1)",
        pins: ["C1.1", "R1.2"],
      })
      expect(native).toContainEqual({
        name: "Net-(C2-Pad1)",
        pins: ["C2.1", "R2.2"],
      })
      const net = pcb
        .getOutput()
        .nets.find((net) => net.name === "Net-(C1-Pad1)")!
      expect(pcb.getOutput().segments).toHaveLength(1)
      expect(pcb.getOutput().segments[0]!.net?.id).toBe(net.id)
      expect(pcb.getOutput().vias[0]!.net?.id).toBe(net.id)
    }
  },
  30_000,
)

test("an unrelated PCB-only net cannot collide with a schematic name", async () => {
  let circuit = await renderIndependentConnections()
  const traces = circuit.filter((e) => e.type === "source_trace")
  traces[1]!.display_name = "Net-(C1-Pad1)"
  const sourceIds = new Set(
    circuit
      .filter((e) => e.type === "source_component")
      .filter((e) => ["R2", "C2"].includes(e.name!))
      .map((e) => e.source_component_id),
  )
  const componentIds = new Set(
    circuit
      .filter((e) => e.type === "schematic_component")
      .filter((e) => sourceIds.has(e.source_component_id!))
      .map((e) => e.schematic_component_id),
  )
  circuit = circuit.filter(
    (e) =>
      !e.type.startsWith("schematic_") ||
      (!("source_component_id" in e && sourceIds.has(e.source_component_id!)) &&
        !(
          "schematic_component_id" in e &&
          componentIds.has(e.schematic_component_id!)
        ) &&
        !(
          "source_trace_id" in e &&
          e.source_trace_id === traces[1]!.source_trace_id
        )),
  )
  expect(await exportNativeSchematicNets(circuit)).toContainEqual({
    name: "Net-(C1-Pad1)",
    pins: ["C1.1", "R1.2"],
  })
  for (const input of [circuit, [...circuit].reverse()]) {
    const before = JSON.stringify(input)
    expect(() =>
      new CircuitJsonToKicadPcbConverter(input).runUntilFinished(),
    ).toThrow(
      'Cannot export disconnected nets with the same KiCad name "Net-(C1-Pad1)"',
    )
    expect(JSON.stringify(input)).toBe(before)
  }
}, 30_000)

test.each(["Net-(R1-Pad1)", "unconnected-(R1-Pad1)"])(
  "unused-pin naming happens after collision resolution: %s",
  async (name) => {
    const circuit = await render(
      <board
        width="20mm"
        height="10mm"
        routingDisabled
        schMaxTraceDistance={100}
      >
        <resistor name="R1" resistance="1k" footprint="0603" schX={-3} />
        <resistor name="R2" resistance="1k" footprint="0603" schX={3} />
        <netlabel net="NAMED" schX={5} schY={1} connectsTo=".R2 > .pin2" />
      </board>,
    )
    for (const label of circuit.filter((e) => e.type === "schematic_net_label"))
      label.text = name
    const native = await exportNativeSchematicNets(circuit)
    expect(native).toContainEqual({
      name: name.startsWith("unconnected")
        ? "unconnected-(R1-Pad1)"
        : "unconnected-(R1-Pad1)_1",
      pins: ["R1.1"],
    })
    expect(native).toContainEqual({ name, pins: ["R2.2"] })
    if (name.startsWith("unconnected")) {
      // Native schematic export has two distinct net codes with the same name.
      // KiCad's PCB reader would merge them even if we wrote different PCB IDs.
      expect(native.filter((net) => net.name === name)).toHaveLength(2)
      for (const input of [circuit, [...circuit].reverse()]) {
        expect(() =>
          new CircuitJsonToKicadPcbConverter(input).runUntilFinished(),
        ).toThrow(
          `Cannot export disconnected nets with the same KiCad name "${name}"`,
        )
      }
    } else {
      await expectNativeParity(circuit)
    }
  },
  30_000,
)

test("existing global label aliases join source groups before selecting the net name", async () => {
  const circuit = await render(
    <board width="30mm" height="20mm" routingDisabled>
      <schematicsheet name="First" displayName="First">
        <resistor name="R1" resistance="1k" footprint="0603" />
        <netlabel net="AAA" schX={-3} schY={2} connectsTo=".R1 > .pin1" />
        <netlabel
          net="FIRST_ZZZ"
          schX={-3}
          schY={-2}
          connectsTo=".R1 > .pin1"
        />
      </schematicsheet>
      <schematicsheet name="Second" displayName="Second">
        <resistor name="R2" resistance="1k" footprint="0603" />
        <netlabel
          net="SECOND_ZZZ"
          schX={-2}
          schY={2}
          connectsTo=".R2 > .pin1"
        />
      </schematicsheet>
    </board>,
  )
  // Imported global labels can alias independently identified source nets.
  for (const label of circuit.filter((e) => e.type === "schematic_net_label")) {
    if (label.text.endsWith("_ZZZ")) label.text = "ZZZ"
  }
  for (const input of [circuit, [...circuit].reverse()]) {
    const { native } = await expectNativeParity(input)
    expect(native).toContainEqual({ name: "AAA", pins: ["R1.1", "R2.1"] })
  }
}, 30_000)

test("a global label joins matching local labels on its own sheet", async () => {
  const circuit = await render(
    <board width="30mm" height="20mm" routingDisabled>
      <schematicsheet name="First" displayName="First">
        <group subcircuit name="FirstCircuit" schMaxTraceDistance={1}>
          <resistor name="R1" resistance="1k" footprint="0603" schX={-2} />
          <resistor name="R2" resistance="1k" footprint="0603" schX={2} />
          <resistor
            name="R3"
            resistance="1k"
            footprint="0603"
            schX={-2}
            schY={4}
          />
          <trace name="SIGNAL" from=".R1 > .pin2" to=".R2 > .pin1" />
          <netlabel net="NAMED" schX={-4} schY={5} connectsTo=".R3 > .pin1" />
        </group>
      </schematicsheet>
      <schematicsheet name="Child" displayName="Child">
        <group subcircuit name="ChildCircuit" schMaxTraceDistance={1}>
          <resistor name="R4" resistance="1k" footprint="0603" schX={-2} />
          <resistor name="R5" resistance="1k" footprint="0603" schX={2} />
          <trace name="CHILD_SIGNAL" from=".R4 > .pin2" to=".R5 > .pin1" />
        </group>
      </schematicsheet>
    </board>,
  )
  for (const label of circuit.filter((e) => e.type === "schematic_net_label"))
    label.text = "SIGNAL"
  for (const text of circuit.filter((e) => e.type === "schematic_text")) {
    if (text.source_trace_id) text.text = "SIGNAL"
  }
  const { native } = await expectNativeParity(circuit)
  expect(native).toContainEqual({
    name: "SIGNAL",
    pins: ["R1.2", "R2.1", "R3.1"],
  })
  expect(native).toContainEqual({
    name: "/Child/SIGNAL",
    pins: ["R4.2", "R5.1"],
  })
}, 30_000)
