import { expect, test } from "bun:test"
import { Circuit } from "tscircuit-no-solder-paste"
import type { CircuitJson } from "circuit-json"
import { Footprint, KicadPcb, parseKicadSexpr } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { CircuitJsonToKicadModConverter } from "lib/footprint/CircuitJsonToKicadModConverter"

test(
  "Core noSolderPaste and coveredWithSolderMask survive component and standalone KiCad exports on both sides",
  async () => {
    // The other fixture compilers register older JSX props. Exercise the newer
    // compiler without changing those existing fixtures' global JSX contract.
    const noPaste = { noSolderPaste: true }
    for (const layer of ["top", "bottom"] as const) {
      const circuit = new Circuit()
      circuit.add(
        <board width={30} height={20} routingDisabled>
          <chip
            name="U1"
            layer={layer}
            footprint={
              <footprint originalLayer="top">
                <smtpad
                  shape="rect"
                  width={1}
                  height={1}
                  pcbX={-3}
                  portHints={["pin1"]}
                />
                <smtpad
                  shape="rect"
                  width={1}
                  height={1}
                  pcbX={0}
                  portHints={["pin2"]}
                  {...noPaste}
                />
                <smtpad
                  shape="rect"
                  width={1}
                  height={1}
                  pcbX={3}
                  portHints={["pin3"]}
                  coveredWithSolderMask
                />
              </footprint>
            }
          />
          <smtpad
            name="standalone-normal"
            shape="rect"
            width={1}
            height={1}
            pcbX={-3}
            pcbY={5}
            layer={layer}
          />
          <smtpad
            name="standalone-no-paste"
            shape="rect"
            width={1.2}
            height={1}
            pcbX={0}
            pcbY={5}
            layer={layer}
            {...noPaste}
          />
          <smtpad
            name="standalone-covered"
            shape="rect"
            width={1.4}
            height={1}
            pcbX={3}
            pcbY={5}
            layer={layer}
            coveredWithSolderMask
          />
        </board>,
      )
      await circuit.renderUntilSettled()
      const circuitJson = circuit.getCircuitJson() as CircuitJson
      const pads = circuitJson.filter(
        (element) => element.type === "pcb_smtpad",
      )
      const pastes = circuitJson.filter(
        (element) => element.type === "pcb_solder_paste",
      )
      expect(pads).toHaveLength(6)
      expect(pastes).toHaveLength(2)
      expect(pastes.every((paste) => paste.layer === layer)).toBe(true)
      const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
      converter.runUntilFinished()
      const pcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
      const side = layer === "top" ? "F" : "B"
      const expected = [
        [`${side}.Cu`, `${side}.Paste`, `${side}.Mask`],
        [`${side}.Cu`, `${side}.Mask`],
        [`${side}.Cu`],
      ]
      const componentFootprint = pcb.footprints.find(
        (footprint) => footprint.fpPads.length === 3,
      )!
      expect(
        componentFootprint.fpPads.map((pad) => pad.layers!.layers),
      ).toEqual(expected)
      const standaloneFootprints = pcb.footprints.filter(
        (footprint) => footprint.fpPads.length === 1,
      )
      expect(
        standaloneFootprints.map(
          (footprint) => footprint.fpPads[0]!.layers!.layers,
        ),
      ).toEqual(expected)
      const modConverter = new CircuitJsonToKicadModConverter(circuitJson, {
        footprintName: componentFootprint.libraryLink!.split(":").pop()!,
      })
      modConverter.runUntilFinished()
      const mod = parseKicadSexpr(modConverter.getOutputString()).find(
        (node) => node instanceof Footprint,
      )!
      expect(mod.fpPads.map((pad) => pad.layers!.layers)).toEqual(expected)
      for (const paste of pastes)
        expect(
          pads.some((pad) => pad.pcb_smtpad_id === paste.pcb_smtpad_id),
        ).toBe(true)
    }
  },
  { timeout: 30000 },
)
