import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import usbCC165948CircuitJson from "tests/assets/usb-c-C165948.circuit.json"

// Circuit JSON with no pcb_solder_paste records at all (e.g. imported from
// KiCad) doesn't model paste, so uncovered SMD pads keep F.Paste.
test("repro37: circuit json without solder paste records keeps F.Paste", () => {
  const converter = new CircuitJsonToKicadPcbConverter(
    usbCC165948CircuitJson as CircuitJson,
  )
  converter.runUntilFinished()
  const pads = converter
    .getOutput()
    .footprints.flatMap((fp) => fp.fpPads)
    .filter((pad) => pad.padType === "smd")
  expect(pads.length).toBeGreaterThan(0)
  for (const pad of pads) {
    expect(pad.layers?.layers).toContain("F.Paste")
  }
})
