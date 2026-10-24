import { expect, test } from "bun:test"
import type { CircuitJson, PcbSmtPad } from "circuit-json"
import { Footprint, KicadPcb, parseKicadSexpr } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { CircuitJsonToKicadModConverter } from "lib/footprint/CircuitJsonToKicadModConverter"

test(
  "paste and mask intent survives board and footprint-library exports for every SMT pad shape",
  () => {
    const shapes = [
      { shape: "rect" as const, x: 0, y: 0, width: 2, height: 1 },
      {
        shape: "rotated_rect" as const,
        x: 0,
        y: 0,
        width: 2,
        height: 1,
        ccw_rotation: 30,
      },
      { shape: "circle" as const, x: 0, y: 0, radius: 0.5 },
      { shape: "pill" as const, x: 0, y: 0, width: 2, height: 1, radius: 0.5 },
      {
        shape: "rotated_pill" as const,
        x: 0,
        y: 0,
        width: 2,
        height: 1,
        radius: 0.5,
        ccw_rotation: 30,
      },
      {
        shape: "polygon" as const,
        points: [
          { x: -1, y: -0.5 },
          { x: 1, y: -0.5 },
          { x: 0.5, y: 0.5 },
        ],
      },
    ]
    const policies = [
      {
        name: "no-paste",
        paste: false,
        covered: false,
        margin: undefined,
        mask: true,
      },
      {
        name: "paste",
        paste: true,
        covered: false,
        margin: undefined,
        mask: true,
      },
      {
        name: "covered",
        paste: false,
        covered: true,
        margin: undefined,
        mask: false,
      },
      {
        name: "covered-with-paste-record",
        paste: true,
        covered: true,
        margin: 0,
        mask: false,
      },
      {
        name: "fiducial-pullback",
        paste: false,
        covered: true,
        margin: 0.2,
        mask: true,
      },
    ]
    for (const layer of ["top", "bottom"] as const) {
      const side = layer === "top" ? "F" : "B"
      for (const owned of [false, true]) {
        for (const geometry of shapes) {
          for (const policy of policies) {
            const pcbPad: PcbSmtPad = {
              ...structuredClone(geometry),
              type: "pcb_smtpad",
              pcb_smtpad_id: "pad",
              pcb_component_id: owned ? "component" : undefined,
              layer,
              is_covered_with_solder_mask: policy.covered,
              soldermask_margin: policy.margin,
            }
            const circuitJson: CircuitJson = [
              {
                type: "pcb_board",
                pcb_board_id: "board",
                center: { x: 0, y: 0 },
                width: 20,
                height: 20,
                thickness: 1.6,
                num_layers: 2,
                material: "fr4",
              },
            ]
            if (owned)
              circuitJson.push(
                {
                  type: "source_component",
                  source_component_id: "source",
                  ftype: "simple_chip",
                  name: "U1",
                },
                {
                  type: "pcb_component",
                  pcb_component_id: "component",
                  source_component_id: "source",
                  center: { x: 0, y: 0 },
                  width: 4,
                  height: 4,
                  rotation: 0,
                  obstructs_within_bounds: false,
                  layer,
                },
              )
            circuitJson.push(pcbPad)
            if (policy.paste)
              circuitJson.push({
                type: "pcb_solder_paste",
                pcb_solder_paste_id: "paste",
                pcb_smtpad_id: "pad",
                shape: "rect",
                x: 0,
                y: 0,
                width: 0.8,
                height: 0.8,
                layer,
              })
            const expected = [
              `${side}.Cu`,
              ...(policy.paste && !policy.covered ? [`${side}.Paste`] : []),
              ...(policy.mask ? [`${side}.Mask`] : []),
            ]
            const label = `${layer} ${owned ? "component" : "standalone"} ${geometry.shape} ${policy.name}`
            const pcbConverter = new CircuitJsonToKicadPcbConverter(circuitJson)
            pcbConverter.runUntilFinished()
            const pcb = KicadPcb.parse(
              pcbConverter.getOutputString(),
            )[0] as KicadPcb
            expect(pcb.footprints[0]!.fpPads[0]!.layers!.layers, label).toEqual(
              expected,
            )
            const modConverter = new CircuitJsonToKicadModConverter(circuitJson)
            modConverter.runUntilFinished()
            const footprint = parseKicadSexpr(
              modConverter.getOutputString(),
            ).find((node) => node instanceof Footprint)!
            expect(footprint.fpPads[0]!.layers!.layers, label).toEqual(expected)
          }
        }
      }
    }
  },
  { timeout: 30000 },
)
