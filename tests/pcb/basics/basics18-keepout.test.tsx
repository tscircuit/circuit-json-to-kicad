import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { parseKicadPcb, Xy, type Zone } from "kicadts"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

const getZoneXyPoints = (zone: Zone) =>
  (zone.polygons[0]?.pts?.points ?? [])
    .filter((point): point is Xy => point instanceof Xy)
    .map((point) => [point.x, point.y])

const expectAllKeepoutRulesNotAllowed = (zone: Zone) => {
  expect(zone.keepout?.tracks).toBe("not_allowed")
  expect(zone.keepout?.vias).toBe("not_allowed")
  expect(zone.keepout?.pads).toBe("not_allowed")
  expect(zone.keepout?.copperpour).toBe("not_allowed")
  expect(zone.keepout?.footprints).toBe("not_allowed")
}

test("pcb keepouts export as KiCad keepout zones", async () => {
  const realPcb = parseKicadPcb(
    await readFile("tests/assets/keepout.kicad_pcb", "utf8"),
  )
  expect(realPcb.graphicLines).toHaveLength(4)
  expect(realPcb.zones).toHaveLength(0)

  const circuit = new Circuit()
  circuit.add(
    <board width="10mm" height="10mm">
      <keepout shape="rect" pcbX={12} pcbY={0} width="2.4mm" height="5mm" />
      <keepout
        shape="circle"
        pcbX={-3}
        pcbY={2}
        radius="1mm"
        layers={["top", "bottom"]}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()

  const kicadPcb = parseKicadPcb(converter.getOutputString())
  expect(kicadPcb.zones).toHaveLength(2)

  const rectKeepout = kicadPcb.zones[0]!
  expect(rectKeepout.net).toBe(0)
  expect(rectKeepout.netName).toBe("")
  expect(rectKeepout.layer?.names).toEqual(["F.Cu"])
  expectAllKeepoutRulesNotAllowed(rectKeepout)
  expect(getZoneXyPoints(rectKeepout)).toEqual([
    [113.2, 102.5],
    [113.2, 97.5],
    [110.8, 97.5],
    [110.8, 102.5],
  ])

  const circleKeepout = kicadPcb.zones[1]!
  expect(circleKeepout.layers?.names).toEqual(["F.Cu", "B.Cu"])
  expectAllKeepoutRulesNotAllowed(circleKeepout)
  const circlePoints = getZoneXyPoints(circleKeepout)
  expect(circlePoints).toHaveLength(64)
  expect(circlePoints[0]).toEqual([98, 98])
  expect(circlePoints[16]).toEqual([97, 97])
  expect(circlePoints[32]).toEqual([96, 98])
  expect(circlePoints[48]).toEqual([97, 99])
})
