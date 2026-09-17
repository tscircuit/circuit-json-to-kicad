import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "../../../lib/pcb/CircuitJsonToKicadPcbConverter"

test("repro4948: captures current pad-net loss during a KiCad round trip", () => {
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
  const sourceTraces = circuitJson.filter((e) => e.type === "source_trace")
  expect(sourcePorts).toHaveLength(5)
  expect(pcbPorts).toHaveLength(6)
  expect(new Set(pcbPorts.map((port) => port.pcb_port_id)).size).toBe(6)
  expect(
    sourcePorts.every((port) => !port.subcircuit_connectivity_map_key),
  ).toBe(true)

  const exporter = new CircuitJsonToKicadPcbConverter(circuitJson)
  exporter.runUntilFinished()
  const output = exporter.getOutputString()
  const exported = parseKicadPcb(output)
  const reimporter = new KicadToCircuitJsonConverter()
  reimporter.addFile("roundtrip.kicad_pcb", output)
  reimporter.runUntilFinished()
  const roundtrip = reimporter.getOutput()

  // Capture today's output: pad identities survive export, but their nets do not.
  expect({
    importedTerminalNets: sourcePorts
      .map((port) => ({
        pad: port.name,
        nets: sourceTraces
          .filter((trace) =>
            trace.connected_source_port_ids.includes(port.source_port_id),
          )
          .map((trace) => trace.display_name)
          .sort(),
      }))
      .sort((a, b) => a.pad.localeCompare(b.pad)),
    exportedPads: exported.footprints.flatMap((footprint) =>
      footprint.fpPads.map((pad) => ({
        pad: pad.number,
        type: pad.padType,
        net: pad.net?.name ?? null,
      })),
    ),
    reimported: {
      references: roundtrip
        .filter((e) => e.type === "source_component")
        .map((e) => e.name),
      pcbPortCount: roundtrip.filter((e) => e.type === "pcb_port").length,
      terminalNames: roundtrip
        .filter((e) => e.type === "source_port")
        .map((e) => e.name)
        .sort(),
      netNames: roundtrip
        .filter((e) => e.type === "source_net")
        .map((e) => e.name)
        .sort(),
    },
  }).toMatchInlineSnapshot(`
    {
      "exportedPads": [
        {
          "net": null,
          "pad": "A6",
          "type": "smd",
        },
        {
          "net": null,
          "pad": "B6",
          "type": "smd",
        },
        {
          "net": null,
          "pad": "A7",
          "type": "smd",
        },
        {
          "net": null,
          "pad": "B7",
          "type": "smd",
        },
        {
          "net": null,
          "pad": "SHIELD",
          "type": "smd",
        },
        {
          "net": null,
          "pad": "SHIELD",
          "type": "thru_hole",
        },
      ],
      "importedTerminalNets": [
        {
          "nets": [
            "USB_DP",
          ],
          "pad": "A6",
        },
        {
          "nets": [
            "USB_DM",
          ],
          "pad": "A7",
        },
        {
          "nets": [
            "USB_DP",
          ],
          "pad": "B6",
        },
        {
          "nets": [
            "USB_DM",
          ],
          "pad": "B7",
        },
        {
          "nets": [
            "GND",
          ],
          "pad": "SHIELD",
        },
      ],
      "reimported": {
        "netNames": [],
        "pcbPortCount": 6,
        "references": [
          "J1",
        ],
        "terminalNames": [],
      },
    }
  `)
})
