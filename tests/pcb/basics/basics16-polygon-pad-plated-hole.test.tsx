import { test, expect } from "bun:test"
import { Circuit } from "tscircuit"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

const buildPcb = async (holeProps: Record<string, unknown>) => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm">
      <platedhole
        name="H1"
        pcbX={2}
        pcbY={3}
        shape="hole_with_polygon_pad"
        padOutline={[
          { x: -2, y: -1 },
          { x: 2, y: -1 },
          { x: 2, y: 1 },
          { x: 0, y: 2 },
          { x: -2, y: 1 },
        ]}
        holeOffsetX={0}
        holeOffsetY={0}
        {...(holeProps as any)}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const pcbString = converter.getOutputString()
  const pcb = parseKicadPcb(pcbString)
  const pad = pcb.footprints[0]!.fpPads[0]!
  return { pcbString, pad }
}

test("hole_with_polygon_pad exports a custom pad with the outline and the real drill", async () => {
  const { pcbString, pad } = await buildPcb({
    holeShape: "circle",
    holeDiameter: "1.2mm",
  })

  expect(pad.shape).toBe("custom")
  expect(pad.padType).toBe("thru_hole")
  expect(pad.drill?.diameter).toBeCloseTo(1.2, 6)
  // standalone plated holes get their own footprint at the hole position
  // (board origin is offset to 100,100 and the KiCad Y axis points down)
  expect(pcbString).toContain("(at 102 97 0)")
  expect(pad.options?.anchor).toBe("circle")

  // the outline is emitted as a gr_poly primitive, relative to the pad, Y flipped
  expect(pcbString).toContain("(gr_poly")
  expect(pcbString).toContain("(xy -2 1)")
  expect(pcbString).toContain("(xy 0 -2)")

  // no trace of the old 1.6mm / 0.8mm fallback
  expect(pcbString).not.toContain("(size 1.6 1.6)")
  expect(pcbString).not.toContain("(drill 0.8)")
})

test("hole_with_polygon_pad with an oval drill keeps the oval drill size", async () => {
  const { pad } = await buildPcb({
    holeShape: "oval",
    holeWidth: "1mm",
    holeHeight: "2mm",
  })

  expect(pad.shape).toBe("custom")
  expect(pad.drill?.oval).toBe(true)
  expect(pad.drill?.diameter).toBeCloseTo(1, 6)
  expect(pad.drill?.width).toBeCloseTo(2, 6)
})
