import { expect, test } from "bun:test"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { readFileSync } from "node:fs"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "../../../lib/pcb/CircuitJsonToKicadPcbConverter"

test("imported coincident contacts and repeated lands retain their pad nets", () => {
  const importer = new KicadToCircuitJsonConverter()
  importer.addFile(
    "usb-c-pad-identities.kicad_pcb",
    readFileSync(
      new URL("../../assets/usb-c-pad-identities.kicad_pcb", import.meta.url),
      "utf8",
    ),
  )
  importer.runUntilFinished()
  const circuitJson = importer.getOutput()
  const sourcePorts = circuitJson.filter((e) => e.type === "source_port")
  const pcbPorts = circuitJson.filter((e) => e.type === "pcb_port")
  expect(sourcePorts).toHaveLength(5)
  expect(pcbPorts).toHaveLength(6)
  expect(new Set(pcbPorts.map((port) => port.pcb_port_id)).size).toBe(6)
  expect(
    sourcePorts.every((port) => !port.subcircuit_connectivity_map_key),
  ).toBe(true)

  const exporter = new CircuitJsonToKicadPcbConverter(circuitJson)
  exporter.runUntilFinished()
  const exported = parseKicadPcb(exporter.getOutputString())
  const padNets = exported.footprints.flatMap((footprint) =>
    footprint.fpPads.map((pad) => [pad.number, pad.net?.name ?? ""]),
  )
  expect(padNets.sort()).toEqual(
    [
      ["A6", "USB_DP"],
      ["B6", "USB_DP"],
      ["A7", "USB_DM"],
      ["B7", "USB_DM"],
      ["SHIELD", "GND"],
      ["SHIELD", "GND"],
    ].sort(),
  )

  const reimporter = new KicadToCircuitJsonConverter()
  reimporter.addFile("roundtrip.kicad_pcb", exporter.getOutputString())
  reimporter.runUntilFinished()
  const roundtrip = reimporter.getOutput()
  expect(roundtrip.filter((e) => e.type === "pcb_port")).toHaveLength(6)
  const roundtripPorts = roundtrip.filter((e) => e.type === "source_port")
  expect(roundtripPorts).toHaveLength(5)
  expect(
    roundtrip.filter((e) => e.type === "source_component").map((e) => e.name),
  ).toEqual(["J1"])
  const roundtripNets = roundtrip.filter((e) => e.type === "source_net")
  const roundtripTraces = roundtrip.filter((e) => e.type === "source_trace")
  expect(
    roundtripPorts
      .map((port) => {
        const trace = roundtripTraces.find((trace) =>
          trace.connected_source_port_ids.includes(port.source_port_id),
        )!
        const net = roundtripNets.find((net) =>
          trace.connected_source_net_ids?.includes(net.source_net_id),
        )!
        return [port.name, net.name]
      })
      .sort(),
  ).toEqual(
    [
      ["A6", "USB_DP"],
      ["B6", "USB_DP"],
      ["A7", "USB_DM"],
      ["B7", "USB_DM"],
      ["SHIELD", "GND"],
    ].sort(),
  )
})
