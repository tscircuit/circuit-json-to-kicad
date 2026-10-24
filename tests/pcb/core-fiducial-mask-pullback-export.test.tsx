import { expect, test } from "bun:test"
import { Circuit } from "tscircuit-no-solder-paste"
import type { CircuitJson } from "circuit-json"
import { Footprint, KicadPcb, parseKicadSexpr } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { CircuitJsonToKicadModConverter } from "lib/footprint/CircuitJsonToKicadModConverter"

test(
  "Core fiducials keep an explicit mask pullback and omit paste in both export formats",
  async () => {
    for (const layer of ["top", "bottom"] as const) {
      const circuit = new Circuit()
      circuit.add(
        <board width={10} height={10} routingDisabled>
          <fiducial
            name="FID1"
            padDiameter={1}
            soldermaskPullback={0.2}
            layer={layer}
          />
        </board>,
      )
      await circuit.renderUntilSettled()
      const circuitJson = circuit.getCircuitJson() as CircuitJson
      const sourcePad = circuitJson.find(
        (element) => element.type === "pcb_smtpad",
      )!
      expect(sourcePad.is_covered_with_solder_mask).toBe(true)
      expect(sourcePad.soldermask_margin).toBe(0.2)
      expect(
        circuitJson.filter((element) => element.type === "pcb_solder_paste"),
      ).toHaveLength(0)
      const side = layer === "top" ? "F" : "B"
      const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
      pcbConverter.runUntilFinished()
      const pcb = KicadPcb.parse(pcbConverter.getOutputString())[0] as KicadPcb
      expect(pcb.footprints[0]!.fpPads[0]!.layers!.layers).toEqual([
        `${side}.Cu`,
        `${side}.Mask`,
      ])
      const modConverter = new CircuitJsonToKicadModConverter(circuitJson)
      modConverter.runUntilFinished()
      const mod = parseKicadSexpr(modConverter.getOutputString()).find(
        (node) => node instanceof Footprint,
      )!
      expect(mod.fpPads[0]!.layers!.layers).toEqual([
        `${side}.Cu`,
        `${side}.Mask`,
      ])
      expect(modConverter.getOutputString()).toContain(
        "(solder_mask_margin 0.2)",
      )
    }
  },
  { timeout: 30000 },
)
