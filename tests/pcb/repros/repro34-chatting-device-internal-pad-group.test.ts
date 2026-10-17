import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import fixture from "tests/assets/repro34-chatting-device-internal-pad-group.json"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

test("repro34: Chatting Device internal pad group loses GND in KiCad", async () => {
  // Full routed board from the reported conversion, kept unchanged.
  const circuitJson = fixture as CircuitJson
  expect(
    circuitJson.filter((element) => element.type === "pcb_board"),
  ).toHaveLength(1)
  expect(
    circuitJson.filter((element) => element.type === "pcb_component"),
  ).toHaveLength(11)
  expect(
    circuitJson.filter((element) => element.type === "pcb_trace"),
  ).toHaveLength(42)

  const sourceComponent = circuitJson
    .filter((element) => element.type === "source_component")
    .find((component) => component.name === "U1")!
  expect(sourceComponent.manufacturer_part_number).toBe("ESP32_WROOM_32E_N4")
  const internalConnection = circuitJson
    .filter(
      (element) => element.type === "source_component_internal_connection",
    )
    .find(
      (connection) =>
        connection.source_component_id === sourceComponent.source_component_id,
    )!
  const memberIds = internalConnection.source_port_ids
  expect(memberIds).toHaveLength(9)
  expect(sourceComponent.internally_connected_source_port_ids).toEqual([
    memberIds,
  ])
  const members = circuitJson
    .filter((element) => element.type === "source_port")
    .filter((port) => memberIds.includes(port.source_port_id))
  expect(members).toHaveLength(9)
  const ground = circuitJson
    .filter((element) => element.type === "source_net")
    .find((net) => net.name === "GND")!
  expect(
    members.filter((port) => port.subcircuit_connectivity_map_key),
  ).toHaveLength(1)
  expect(
    members.find((port) => port.pin_number === 39)
      ?.subcircuit_connectivity_map_key,
  ).toBe(ground.subcircuit_connectivity_map_key)

  // Each member has a physical piece of the same exposed pad, numbered 39.
  const pcbPorts = circuitJson
    .filter((element) => element.type === "pcb_port")
    .filter((port) => memberIds.includes(port.source_port_id!))
  const pcbPortIds = new Set(pcbPorts.map((port) => port.pcb_port_id))
  const sourcePads = circuitJson
    .filter((element) => element.type === "pcb_smtpad")
    .filter((pad) => pcbPortIds.has(pad.pcb_port_id!))
  expect(sourcePads).toHaveLength(9)
  expect(sourcePads.every((pad) => pad.port_hints?.includes("pin39"))).toBe(
    true,
  )

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  await Bun.write(
    "./debug-output/repro34-chatting-device-internal-pad-group.kicad_pcb",
    output,
  )
  // Parse the serialized PCB so this checks the delivered file, not only context.
  const pcb = parseKicadPcb(output)
  const u1 = pcb.footprints.find((footprint) =>
    footprint.properties.some(
      (property) => property.key === "Reference" && property.value === "U1",
    ),
  )!
  const exposedPads = u1.fpPads.filter((pad) => pad.number === "39")
  expect(exposedPads).toHaveLength(9)
  // Repro baseline, not desired behavior. The internal group already supplies
  // GND via its primary port; a fix should assign GND to all nine pieces.
  expect(exposedPads.map((pad) => pad.net?.name ?? null)).toEqual([
    "GND",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ])

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    pcbDrillHoleColor: "white",
  })
  expect(kicadSnapshot.exitCode).toBe(0)
  await expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 120_000)
