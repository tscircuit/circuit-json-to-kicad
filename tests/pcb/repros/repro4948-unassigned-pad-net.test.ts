import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "../../../lib/pcb/CircuitJsonToKicadPcbConverter"

test("repro4948: captures current loss of a connected neighbor's net", () => {
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
  const port = sourcePorts.find((port) => port.name === "B6")!
  const traces = circuitJson.filter((e) => e.type === "source_trace")
  for (const trace of traces) {
    trace.connected_source_port_ids = trace.connected_source_port_ids.filter(
      (id) => id !== port.source_port_id,
    )
  }

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pads = parseKicadPcb(converter.getOutputString()).footprints.flatMap(
    (fp) => fp.fpPads,
  )
  // B6 is intentionally unassigned; the bug also removes A6's USB_DP membership.
  expect(
    ["A6", "B6"].map((name) => {
      const sourcePort = sourcePorts.find((port) => port.name === name)!
      const pad = pads.find((pad) => pad.number === name)!
      return {
        pad: pad.number,
        inputNets: traces
          .filter((trace) =>
            trace.connected_source_port_ids.includes(sourcePort.source_port_id),
          )
          .map((trace) => trace.display_name)
          .sort(),
        exportedNet: pad.net?.name ?? null,
      }
    }),
  ).toMatchInlineSnapshot(`
    [
      {
        "exportedNet": null,
        "inputNets": [
          "USB_DP",
        ],
        "pad": "A6",
      },
      {
        "exportedNet": null,
        "inputNets": [],
        "pad": "B6",
      },
    ]
  `)
})
