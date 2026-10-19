/**
 * Standalone plated holes all export their pad with the same UUID. The pad
 * UUID seed includes the component id, but the standalone plated hole stage
 * never passes one, so every hole at its own origin hashes to the same value.
 * Standalone SMT pads pass their pcb_smtpad_id and stay unique.
 *
 * To run: bun test tests/pcb/repros/repro36-standalone-plated-hole-pad-uuid.test.tsx
 */
import { beforeAll, expect, test } from "bun:test"
import type { FootprintPad } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"

let platedHolePads: FootprintPad[]
let smtPads: FootprintPad[]

beforeAll(async () => {
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
  platedHolePads = pads.filter((pad) => pad.padType === "thru_hole")
  smtPads = pads.filter((pad) => pad.padType === "smd")
})

test("repro36: standalone SMT pads export unique pad UUIDs", () => {
  expect(smtPads).toHaveLength(2)
  expect(new Set(smtPads.map((pad) => pad.uuid?.value)).size).toBe(2)
})

test.failing("repro36: standalone plated holes export unique pad UUIDs", () => {
  expect(platedHolePads).toHaveLength(3)
  expect(new Set(platedHolePads.map((pad) => pad.uuid?.value)).size).toBe(3)
})
