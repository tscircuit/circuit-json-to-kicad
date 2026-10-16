import { expect, test } from "bun:test"
import type { CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

test("repro638: uncovered SMD pads without pcb_solder_paste omit paste layer and covered pads omit mask layer", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <chip
        name="U1"
        footprint={
          <footprint>
            <smtpad
              shape="rect"
              width="1mm"
              height="1mm"
              portHints={["pin1"]}
              pcbX={-3}
              pcbY={0}
            />
            <smtpad
              shape="polygon"
              points={[
                { x: -0.5, y: -0.5 },
                { x: 0.5, y: -0.5 },
                { x: 0.5, y: 0.5 },
                { x: -0.5, y: 0.5 },
              ]}
              portHints={["pin2"]}
              pcbX={0}
              pcbY={0}
            />
            <smtpad
              shape="rect"
              width="1mm"
              height="1mm"
              portHints={["pin3"]}
              pcbX={3}
              pcbY={0}
              coveredWithSolderMask
            />
          </footprint>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson() as CircuitJson

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pcb = parseKicadPcb(converter.getOutputString())

  const footprint = pcb.footprints[0]
  expect(footprint).toBeDefined()

  const pad1 = footprint!.fpPads.find((pad) => pad.number === "1")
  const pad2 = footprint!.fpPads.find((pad) => pad.number === "2")
  const pad3 = footprint!.fpPads.find((pad) => pad.number === "3")

  // Pin 1: normal uncovered rect pad with pcb_solder_paste -> F.Cu, F.Paste, F.Mask
  expect(pad1?.layers?.layers).toEqual(["F.Cu", "F.Paste", "F.Mask"])

  // Pin 2: uncovered polygon pad without pcb_solder_paste -> F.Cu, F.Mask (no F.Paste)
  expect(pad2?.layers?.layers).toEqual(["F.Cu", "F.Mask"])

  // Pin 3: covered rect pad (coveredWithSolderMask) -> F.Cu only (no F.Paste, no F.Mask)
  expect(pad3?.layers?.layers).toEqual(["F.Cu"])
})

test("repro638: standalone and bottom SMD pads respect pcb_solder_paste and is_covered_with_solder_mask", () => {
  const circuitJson: CircuitJson = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_0",
      center: { x: 0, y: 0 },
      width: 20,
      height: 20,
      thickness: 1.6,
      num_layers: 2,
      material: "fr4",
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad_top_no_paste",
      shape: "rect",
      x: -4,
      y: 0,
      width: 1,
      height: 1,
      layer: "top",
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad_bottom_with_paste",
      shape: "rect",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      layer: "bottom",
    },
    {
      type: "pcb_solder_paste",
      pcb_solder_paste_id: "paste_bottom",
      pcb_smtpad_id: "pad_bottom_with_paste",
      shape: "rect",
      x: 0,
      y: 0,
      width: 0.7,
      height: 0.7,
      layer: "bottom",
    },
    {
      type: "pcb_smtpad",
      pcb_smtpad_id: "pad_bottom_covered",
      shape: "rect",
      x: 4,
      y: 0,
      width: 1,
      height: 1,
      layer: "bottom",
      is_covered_with_solder_mask: true,
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pcb = parseKicadPcb(converter.getOutputString())

  const padLayers = pcb.footprints.map(
    (fp) => fp.fpPads[0]?.layers?.layers ?? [],
  )
  expect(padLayers).toEqual([
    ["F.Cu", "F.Mask"],
    ["B.Cu", "B.Paste", "B.Mask"],
    ["B.Cu"],
  ])
})
