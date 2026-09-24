import { expect, test } from "bun:test"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test.each(["pill", "rotated_pill"])(
  "legacy %s paste without a radius has semicircular ends",
  (shape) => {
    // Older serialized Circuit JSON can omit the now-required radius field.
    const input = JSON.parse(
      JSON.stringify([
        {
          type: "pcb_solder_paste",
          pcb_solder_paste_id: "legacy_paste",
          shape,
          x: 1,
          y: 2,
          width: 3,
          height: 1,
          layer: "top",
          ...(shape === "rotated_pill" ? { ccw_rotation: 30 } : {}),
        },
      ]),
    )
    const converter = new CircuitJsonToKicadPcbConverter(input)
    converter.runUntilFinished()
    const output = converter.getOutputString()
    expect(output).not.toMatch(/NaN|undefined/)
    const pcb = KicadPcb.parse(output)[0] as KicadPcb
    expect(pcb.footprints).toHaveLength(1)
    const pads = pcb.footprints[0]!.fpPads
    expect(pads).toHaveLength(1)
    const aperture = pads[0]!
    expect(aperture.shape).toBe("roundrect")
    expect(aperture.roundrectRatio).toBe(0.5)
    expect(aperture.size?.width).toBe(3)
    expect(aperture.size?.height).toBe(1)
    expect(aperture.at?.angle).toBe(shape === "rotated_pill" ? 30 : 0)
    expect(aperture.layers?.layers).toEqual(["F.Paste"])
  },
)
