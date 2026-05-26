import { expect, test } from "bun:test"
import circuitJson from "tests/assets/alarmv2.json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { parseKicadPcb } from "kicadts"

test("alarmv2 circuit json converts to parseable KiCad PCB", async () => {
  const hasThroughPadRoutePoint = circuitJson.some(
    (element) =>
      element.type === "pcb_trace" &&
      element.route?.some((point) => point.route_type === "through_pad"),
  )

  expect(hasThroughPadRoutePoint).toBe(true)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)

  converter.runUntilFinished()
  const kicadPcbContent = converter.getOutputString()
  const invalidCoordinateLines = kicadPcbContent
    .split("\n")
    .filter((line) => line.includes("NaN") || line.includes("undefined"))

  expect(invalidCoordinateLines).toEqual([])
  expect(() => parseKicadPcb(kicadPcbContent)).not.toThrow()
})
