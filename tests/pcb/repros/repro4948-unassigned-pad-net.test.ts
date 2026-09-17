import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "../../../lib/pcb/CircuitJsonToKicadPcbConverter"
import { readFileSync } from "node:fs"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"

test("a terminal without net membership stays unassigned beside a connected contact", () => {
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
    (e) => e.type === "source_port" && e.name === "B6",
  )!
  if (port.type !== "source_port") throw new Error("Missing B6")
  for (const element of circuitJson) {
    if (element.type === "source_trace") {
      element.connected_source_port_ids =
        element.connected_source_port_ids.filter(
          (id) => id !== port.source_port_id,
        )
    }
  }

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pads = converter.getOutput().footprints.flatMap((fp) => fp.fpPads)
  expect(pads.find((pad) => pad.number === "B6")?.net).toBeUndefined()
  expect(pads.find((pad) => pad.number === "A6")?.net?.name).toBe("USB_DP")
})
