import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "../../../lib/pcb/CircuitJsonToKicadPcbConverter"
import { readFileSync } from "node:fs"
import { KicadToCircuitJsonConverter } from "kicad-to-circuit-json"

test("coincident contacts on different nets do not acquire each other's net", () => {
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
  const traces = circuitJson.filter((e) => e.type === "source_trace")
  const dp = traces.find((trace) => trace.display_name === "USB_DP")!
  const dm = traces.find((trace) => trace.display_name === "USB_DM")!
  dp.connected_source_port_ids = dp.connected_source_port_ids.filter(
    (id) => id !== port.source_port_id,
  )
  dm.connected_source_port_ids.push(port.source_port_id)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pads = converter.getOutput().footprints.flatMap((fp) => fp.fpPads)
  const a6 = pads.find((pad) => pad.number === "A6")!
  const b6 = pads.find((pad) => pad.number === "B6")!
  expect(a6.at?.x).toBe(b6.at?.x)
  expect(a6.at?.y).toBe(b6.at?.y)
  expect(a6.net?.name).toBe("USB_DP")
  expect(b6.net?.name).toBe("USB_DM")
})
