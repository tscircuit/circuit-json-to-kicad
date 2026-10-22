import type { FootprintPad } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

/**
 * Three standalone plated holes and two standalone SMT pads. The pad UUID
 * seed includes the component id: standalone SMT pads pass their
 * pcb_smtpad_id, but the standalone plated hole path never passes one.
 */
export async function createStandalonePlatedHolePadUuidRepro(): Promise<{
  platedHolePads: FootprintPad[]
  smtPads: FootprintPad[]
}> {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm" routingDisabled>
      <platedhole
        pcbX={-8}
        pcbY={0}
        shape="circle"
        holeDiameter="1mm"
        outerDiameter="2mm"
      />
      <platedhole
        pcbX={0}
        pcbY={0}
        shape="circle"
        holeDiameter="1mm"
        outerDiameter="2mm"
      />
      <platedhole
        pcbX={8}
        pcbY={0}
        shape="pill"
        holeWidth="1mm"
        holeHeight="2mm"
        outerWidth="2mm"
        outerHeight="3mm"
      />
      <smtpad pcbX={-4} pcbY={5} shape="rect" width="1mm" height="1mm" />
      <smtpad pcbX={4} pcbY={5} shape="rect" width="1mm" height="1mm" />
    </board>,
  )
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const pads = converter.getOutput().footprints.flatMap((fp) => fp.fpPads)
  return {
    platedHolePads: pads.filter((pad) => pad.padType === "thru_hole"),
    smtPads: pads.filter((pad) => pad.padType === "smd"),
  }
}
