import { test, expect } from "bun:test"
import { readFile } from "node:fs/promises"
import type { AnyCircuitElement } from "circuit-json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("usb-c rotated 3d model placement", async () => {
  const circuitJson = JSON.parse(
    await readFile("tests/assets/usb-repro.json", "utf8"),
  ) as AnyCircuitElement[]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  expect(output).toContain("(at 89.58750405 100 -90)")
  expect(output).toContain("(at 110.41249595 100 90)")
  expect(output).toContain("(at 100 110.42499910000001 0)")
  expect(output).toContain("(at 100 89.57500089999999 -180)")

  expect(output).toContain(`(offset
        (xyz 0.000012699999956566899 -1.5749970500000927 1.6800018)
      )`)
})
