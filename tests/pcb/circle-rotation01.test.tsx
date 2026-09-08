import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("offset footprint circles retain local centers when the component rotates", async () => {
  for (const angle of [0, 45, 90, 180, -90]) {
    const circuit = new Circuit()
    circuit.add(
      <board width={30} height={30}>
        <chip
          name="U1"
          pcbX={4}
          pcbY={-3}
          pcbRotation={angle}
          footprint={
            <footprint>
              <platedhole
                portHints={["1"]}
                pcbX={0}
                pcbY={0}
                outerDiameter={2}
                holeDiameter={1}
                shape="circle"
              />
              <silkscreencircle pcbX={3} pcbY={1} radius={0.7} layer="top" />
              <silkscreencircle pcbX={3} pcbY={1} radius={0.7} layer="bottom" />
              <courtyardcircle pcbX={-2} pcbY={1} radius={0.9} layer="top" />
              <courtyardcircle pcbX={-2} pcbY={1} radius={0.9} layer="bottom" />
            </footprint>
          }
        />
      </board>,
    )
    await circuit.renderUntilSettled()
    const converter = new CircuitJsonToKicadPcbConverter(
      circuit.getCircuitJson(),
    )
    converter.runUntilFinished()
    const pcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
    const circles = pcb.footprints.flatMap((fp) => fp.fpCircles ?? [])
    expect(circles).toHaveLength(4)
    expect(circles.map((circle) => circle.layer?.names[0]).sort()).toEqual([
      "B.CrtYd",
      "B.SilkS",
      "F.CrtYd",
      "F.SilkS",
    ])
    for (const circle of circles) {
      const silk = circle.layer?.names[0]?.includes("SilkS")
      expect(circle.center?.x).toBeCloseTo(silk ? 3 : -2, 8)
      expect(circle.center?.y).toBeCloseTo(-1, 8)
      expect(
        Math.hypot(
          circle.end!.x - circle.center!.x,
          circle.end!.y - circle.center!.y,
        ),
      ).toBeCloseTo(silk ? 0.7 : 0.9, 8)
    }
  }
})
