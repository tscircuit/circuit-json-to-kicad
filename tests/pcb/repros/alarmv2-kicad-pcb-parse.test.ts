import { expect, test } from "bun:test"
import circuitJson from "tests/assets/alarmv2.json"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { parseKicadPcb } from "kicadts"

type RoutePoint = {
  route_type?: string
}

type CircuitJsonElementWithRoute = {
  type: string
  route?: RoutePoint[]
}

test("alarmv2 circuit json converts to parseable KiCad PCB", async () => {
  const throughPadRoutePoints = (circuitJson as CircuitJsonElementWithRoute[])
    .filter((element) => element.type === "pcb_trace")
    .flatMap((trace) => trace.route ?? [])
    .filter((point) => point.route_type === "through_pad")

  expect(throughPadRoutePoints.length).toBeGreaterThan(0)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)

  converter.runUntilFinished()
  const kicadPcbContent = converter.getOutputString()
  const invalidCoordinateLines = kicadPcbContent
    .split("\n")
    .filter((line) => line.includes("NaN") || line.includes("undefined"))

  expect(invalidCoordinateLines).toEqual([])
  expect(() => parseKicadPcb(kicadPcbContent)).not.toThrow()
})
