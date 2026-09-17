import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "../../../lib/pcb/CircuitJsonToKicadPcbConverter"

test("repro4948: captures current net loss for coincident distinct contacts", () => {
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
  const dp = traces.find((trace) => trace.display_name === "USB_DP")!
  const dm = traces.find((trace) => trace.display_name === "USB_DM")!
  dp.connected_source_port_ids = dp.connected_source_port_ids.filter(
    (id) => id !== port.source_port_id,
  )
  dm.connected_source_port_ids.push(port.source_port_id)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pads = parseKicadPcb(converter.getOutputString()).footprints.flatMap(
    (fp) => fp.fpPads,
  )
  const a6 = pads.find((pad) => pad.number === "A6")!
  const b6 = pads.find((pad) => pad.number === "B6")!
  expect(a6.at?.x).toBe(b6.at?.x)
  expect(a6.at?.y).toBe(b6.at?.y)

  // Different input memberships currently both become unassigned on export.
  expect(
    [a6, b6].map((pad) => {
      const sourcePort = sourcePorts.find((port) => port.name === pad.number)!
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
        "inputNets": [
          "USB_DM",
        ],
        "pad": "B6",
      },
    ]
  `)
})
