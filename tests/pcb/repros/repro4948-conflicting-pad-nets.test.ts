import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "../../../lib/pcb/CircuitJsonToKicadPcbConverter"
import { readFileSync } from "node:fs"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"

test("ambiguous pad ownership reports the reference, pad, and conflicting nets", () => {
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
  const dm = circuitJson.find(
    (e) => e.type === "source_trace" && e.display_name === "USB_DM",
  )!
  if (dm.type !== "source_trace") throw new Error("Missing USB_DM")
  dm.connected_source_port_ids.push(port.source_port_id)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  expect(() => converter.runUntilFinished()).toThrow(
    /J1 pad A6.*multiple KiCad nets.*USB_DP.*USB_DM/,
  )
})
