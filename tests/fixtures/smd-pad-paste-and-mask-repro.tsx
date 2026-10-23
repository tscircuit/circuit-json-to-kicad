import type { CircuitJson, PcbSmtPad } from "circuit-json"
import type { Footprint } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

/**
 * SMD pads whose paste and mask layers must follow circuit-json (#638): a 0603
 * resistor (pads with pcb_solder_paste), a bare-copper probe pad (its
 * pcb_solder_paste is removed), a pad covered with solder mask, and a fiducial
 * (covered, with a positive soldermask_margin for its mask pullback).
 */
export async function createSmdPadPasteAndMaskRepro(): Promise<{
  circuitJson: CircuitJson
  resistorFootprint: Footprint
  probePadFootprint: Footprint
  coveredPadFootprint: Footprint
  fiducialFootprint: Footprint
  kicadPcbString: string
}> {
  const circuit = new Circuit()
  circuit.add(
    <board width="24mm" height="12mm" routingDisabled>
      <resistor name="R1" resistance="1k" footprint="0603" pcbX={-7} />
      <smtpad pcbX={0} pcbY={0} shape="rect" width="1.5mm" height="1.5mm" />
      <smtpad
        pcbX={4}
        pcbY={0}
        shape="rect"
        width="1.5mm"
        height="1.5mm"
        coveredWithSolderMask
      />
      <fiducial name="FID1" pcbX={8} pcbY={0} padDiameter="1mm" />
    </board>,
  )
  await circuit.renderUntilSettled()

  // The pad at x=0 is a bare-copper probe landing, so drop its solder paste
  const probePad = circuit
    .getCircuitJson()
    .find(
      (element): element is PcbSmtPad =>
        element.type === "pcb_smtpad" && "x" in element && element.x === 0,
    )!
  const circuitJson = circuit
    .getCircuitJson()
    .filter(
      (element) =>
        element.type !== "pcb_solder_paste" ||
        element.pcb_smtpad_id !== probePad.pcb_smtpad_id,
    )

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const { footprints } = converter.getOutput()
  const [probe, covered] = footprints
    .filter((fp) => fp.libraryLink?.startsWith("tscircuit:smtpad_rect"))
    .sort((a, b) => a.position!.x - b.position!.x)
  return {
    circuitJson,
    resistorFootprint: footprints.find((fp) =>
      fp.libraryLink?.startsWith("tscircuit:resistor"),
    )!,
    probePadFootprint: probe!,
    coveredPadFootprint: covered!,
    fiducialFootprint: footprints.find((fp) =>
      fp.libraryLink?.startsWith("tscircuit:smtpad_circle"),
    )!,
    kicadPcbString: converter.getOutputString(),
  }
}
