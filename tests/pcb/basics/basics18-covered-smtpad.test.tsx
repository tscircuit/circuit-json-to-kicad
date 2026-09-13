import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("covered SMT pads retain copper without solder mask openings", async () => {
  for (const layer of ["top", "bottom"] as const) {
    const circuit = new Circuit()
    circuit.add(
      <board width="12mm" height="8mm">
        <chip
          name="U1"
          layer={layer}
          footprint={
            <footprint>
              <smtpad
                portHints={["pin1"]}
                pcbX={-2}
                shape="rect"
                width="2mm"
                height="1mm"
                coveredWithSolderMask
              />
              <smtpad
                portHints={["pin2"]}
                pcbX={2}
                shape="rect"
                width="2mm"
                height="1mm"
              />
            </footprint>
          }
        />
      </board>,
    )
    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson()
    const sourcePads = circuitJson.filter(
      (element) => element.type === "pcb_smtpad",
    )
    expect(sourcePads).toHaveLength(2)
    expect(sourcePads.map((pad) => pad.is_covered_with_solder_mask)).toEqual([
      true,
      false,
    ])

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()
    const pcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
    const pads = pcb.footprints.flatMap((footprint) => footprint.fpPads)
    expect(pads).toHaveLength(2)

    const side = layer === "top" ? "F" : "B"
    const coveredPad = pads.find((pad) => pad.number === "1")
    const exposedPad = pads.find((pad) => pad.number === "2")
    expect(coveredPad?.layers?.layers).toEqual([`${side}.Cu`])
    expect(exposedPad?.layers?.layers).toEqual([
      `${side}.Cu`,
      `${side}.Paste`,
      `${side}.Mask`,
    ])
    expect(coveredPad?.padType).toBe("smd")
    expect(coveredPad?.size).toEqual(exposedPad?.size)
  }
})
