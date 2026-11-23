import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import { getKicadPcbDrc } from "../../fixtures/get-kicad-pcb-drc"
import { GndPourWithPadHolesBoard } from "./assets/gnd-pour-with-pad-holes-board"

/**
 * Known bug: a copper pour that has holes (any pad, via or trace of another
 * net inside it) is written to KiCad as one `(filled_polygon ...)` per earcut
 * triangle. KiCad treats every filled_polygon as its own copper island, so DRC
 * reports "Isolated copper fill" for each triangle that does not touch a pad
 * of the pour's net, even though the pour is one connected region.
 *
 * On a 60 x 40 mm soil pump controller the bottom GND pour (1 outline, 26
 * holes) became 1,395 triangles and 199 isolated copper warnings; refilling
 * the same zone in KiCad gives 0.
 *
 * KiCad stores a zone fill with holes as fractured polygons: the outline and
 * its holes joined by zero-width cuts into one filled_polygon per island.
 *
 * Marked `test.failing` because it asserts the correct behavior. Remove
 * `.failing` once the fill is exported as one polygon per connected region.
 */
test.failing("copper pour with holes exports as one filled polygon per region", async () => {
  const circuit = new Circuit()
  circuit.add(<GndPourWithPadHolesBoard />)
  await circuit.renderUntilSettled()

  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const output = converter.getOutputString()

  // The GND pour is a single connected region with three pad holes.
  expect(output.match(/\(filled_polygon/g) ?? []).toHaveLength(1)

  const drc = await getKicadPcbDrc(output)
  expect(
    drc.violations.filter((violation) => violation.type === "isolated_copper"),
  ).toEqual([])
}, 30_000)
