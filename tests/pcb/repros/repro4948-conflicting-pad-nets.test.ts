import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "../../../lib/pcb/CircuitJsonToKicadPcbConverter"

test("repro4948: captures current silent export of conflicting pad membership", () => {
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
  const port = circuitJson.find(
    (e) => e.type === "source_port" && e.name === "A6",
  )!
  if (port.type !== "source_port") throw new Error("Missing A6")
  const traces = circuitJson.filter((e) => e.type === "source_trace")
  const dm = traces.find((trace) => trace.display_name === "USB_DM")!
  dm.connected_source_port_ids.push(port.source_port_id)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  // Current behavior completes export despite the contradictory input.
  converter.runUntilFinished()
  const pads = parseKicadPcb(converter.getOutputString()).footprints.flatMap(
    (fp) => fp.fpPads,
  )
  const pad = pads.find((pad) => pad.number === "A6")!
  const component = circuitJson.find(
    (e) =>
      e.type === "source_component" &&
      e.source_component_id === port.source_component_id,
  )
  expect({
    reference: component?.type === "source_component" ? component.name : null,
    pad: pad.number,
    inputNets: traces
      .filter((trace) =>
        trace.connected_source_port_ids.includes(port.source_port_id),
      )
      .map((trace) => trace.display_name)
      .sort(),
    exportCompleted: true,
    exportedNet: pad.net?.name ?? null,
  }).toMatchInlineSnapshot(`
    {
      "exportCompleted": true,
      "exportedNet": null,
      "inputNets": [
        "USB_DM",
        "USB_DP",
      ],
      "pad": "A6",
      "reference": "J1",
    }
  `)
})
