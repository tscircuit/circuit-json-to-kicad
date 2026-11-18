import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { getKicadPcbDrc } from "../../fixtures/get-kicad-pcb-drc"
import { BridgedSolderJumperBoard } from "./assets/bridged-solder-jumper-board"

/**
 * Known bug: the copper bridge of a pre-bridged solder jumper
 * (`solderjumper3_bridged12`) is exported as a free board track,
 * `(segment ... (net 0))`, running from pad 1 to pad 2.
 *
 * When the two bridged pads are on different nets (the usual reason to add a
 * jumper), KiCad DRC reports "Items shorting two nets" plus solder mask
 * bridges. KiCad's own bridged jumpers
 * (Jumper.pretty/SolderJumper-3_P1.3mm_Bridged12_*) keep the bridge inside the
 * footprint as F.Cu copper and declare `(net_tie_pad_groups "1,2")`, so DRC
 * knows the short is intended.
 *
 * Found on a soil pump controller where SJ_PUMP picks the pump supply:
 * pad 1 = V5 (USB), pad 2 = PUMP_V, pad 3 = VEXT.
 *
 * Marked `test.failing` because it asserts the correct behavior. Remove
 * `.failing` once the bridge is exported as footprint copper with a net tie.
 */
test.failing("bridged solder jumper is exported as a net tie, not a net-less track", async () => {
  const circuit = new Circuit()
  circuit.add(<BridgedSolderJumperBoard />)
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const output = converter.getOutputString()

  const drc = await getKicadPcbDrc(output)
  const shorts = drc.violations.filter(
    (violation) => violation.type === "shorting_items",
  )
  const maskBridges = drc.violations.filter(
    (violation) => violation.type === "solder_mask_bridge",
  )

  expect(shorts).toEqual([])
  expect(maskBridges).toEqual([])
}, 30_000)
