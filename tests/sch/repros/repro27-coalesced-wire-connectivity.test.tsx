import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadSchConverter } from "lib"
import { createCoalescedNetCircuit } from "../../fixtures/create-coalesced-net-circuit"

test("repro27: coalesced wire islands on one source net stay connected", async () => {
  const circuitJson = await createCoalescedNetCircuit([
    {
      name: "signal_scope",
      pairs: [
        { firstRef: "R1", firstPin: 2, secondRef: "R2", secondPin: 1, x: 0 },
        { firstRef: "R3", firstPin: 2, secondRef: "R4", secondPin: 1, x: 20 },
      ],
    },
  ])
  const byType = <T extends CircuitJson[number]["type"]>(type: T) =>
    circuitJson.filter(
      (element): element is Extract<CircuitJson[number], { type: T }> =>
        element.type === type,
    )
  const net = byType("source_net").find((element) => element.name === "SIGNAL")
  const sourceTraces = byType("source_trace")
  const schematicWires = byType("schematic_trace")
  const texts = byType("schematic_text")
  const labels = byType("schematic_net_label")
  const components = byType("source_component")
  const ports = byType("source_port")
  const portId = (ref: string, pin: number) => {
    const component = components.find((element) => element.name === ref)
    return ports.find(
      (port) =>
        port.source_component_id === component?.source_component_id &&
        port.pin_number === pin,
    )?.source_port_id
  }
  const sourcePortIds = [
    portId("R1", 2),
    portId("R2", 1),
    portId("R3", 2),
    portId("R4", 1),
  ]
  expect(net).toBeDefined()
  expect(sourcePortIds.every(Boolean)).toBe(true)
  expect(
    sourcePortIds.every((sourcePortId) =>
      sourceTraces.some(
        (trace) =>
          trace.connected_source_net_ids.includes(net!.source_net_id) &&
          trace.connected_source_port_ids.includes(sourcePortId!),
      ),
    ),
  ).toBe(true)
  const coalescedWires = schematicWires.filter((wire) =>
    wire.source_trace_id?.startsWith("schematic_port_"),
  )
  expect(coalescedWires).toHaveLength(2)
  expect(
    coalescedWires.every(
      (wire) =>
        wire.subcircuit_connectivity_map_key ===
        net?.subcircuit_connectivity_map_key,
    ),
  ).toBe(true)
  expect(labels).toHaveLength(0)
  const coalescedTexts = texts.filter((text) =>
    coalescedWires.some((wire) =>
      wire.edges.some(
        (edge) =>
          text.position.x >= Math.min(edge.from.x, edge.to.x) &&
          text.position.x <= Math.max(edge.from.x, edge.to.x) &&
          Math.abs(text.position.y - edge.from.y) < 0.1,
      ),
    ),
  )
  expect(coalescedTexts.length).toBeGreaterThan(0)
  expect(
    coalescedTexts.every((text) =>
      schematicWires.every(
        (wire) => wire.source_trace_id !== text.source_trace_id,
      ),
    ),
  ).toBe(true)
  const schematicPorts = byType("schematic_port")
  const endpointCenters = sourcePortIds.map(
    (sourcePortId) =>
      schematicPorts.find((port) => port.source_port_id === sourcePortId)
        ?.center,
  )
  expect(endpointCenters.every(Boolean)).toBe(true)
  for (const wire of coalescedWires) {
    const matchingPorts =
      wire === coalescedWires[0]
        ? endpointCenters.slice(0, 2)
        : endpointCenters.slice(2, 4)
    const edge = wire.edges[0]!
    expect(
      matchingPorts.every(
        (center) =>
          Math.hypot(center!.x - edge.from.x, center!.y - edge.from.y) < 1e-9 ||
          Math.hypot(center!.x - edge.to.x, center!.y - edge.to.y) < 1e-9,
      ),
    ).toBe(true)
  }
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()
  const tempDir = await mkdtemp(join(tmpdir(), "coalesced-wire-repro-"))
  try {
    const schematicPath = join(tempDir, "coalesced.kicad_sch")
    const netlistPath = join(tempDir, "coalesced.xml")
    const ercPath = join(tempDir, "coalesced-erc.json")
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
    const ercResult = Bun.spawnSync([
      "kicad-cli",
      "sch",
      "erc",
      "--format",
      "json",
      "--output",
      ercPath,
      schematicPath,
    ])
    expect(ercResult.exitCode).toBe(0)
    const ercReport = JSON.parse(await readFile(ercPath, "utf8")) as {
      sheets: Array<{
        violations: Array<{
          type: string
          items: Array<{ description: string }>
        }>
      }>
    }
    const targetPins = new Set(["R1 Pin 2", "R2 Pin 1", "R3 Pin 2", "R4 Pin 1"])
    const disconnectedPinDescriptions = ercReport.sheets
      .flatMap((sheet) => sheet.violations)
      .filter((violation) => violation.type === "pin_not_connected")
      .flatMap((violation) => violation.items.map((item) => item.description))
    expect(
      disconnectedPinDescriptions.some((description) =>
        [...targetPins].some((targetPin) => description.includes(targetPin)),
      ),
    ).toBe(false)
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
