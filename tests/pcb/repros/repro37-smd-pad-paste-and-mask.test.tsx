/**
 * SMD pad paste and mask layers must follow circuit-json (issue #638):
 * - a pad gets F.Paste only when a pcb_solder_paste exists for it
 * - a covered pad gets no F.Mask opening, unless a positive soldermask_margin
 *   asks for one (a fiducial's mask pullback)
 * - circuit json with no pcb_solder_paste records at all (e.g. imported from
 *   KiCad) doesn't model paste, so uncovered pads keep F.Paste
 *
 * To run: bun test tests/pcb/repros/repro37-smd-pad-paste-and-mask.test.tsx
 */
import { beforeAll, expect, test } from "bun:test"
import type { CircuitJson, PcbSmtPad } from "circuit-json"
import type { Footprint } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import usbCC165948CircuitJson from "tests/assets/usb-c-C165948.circuit.json"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

let circuitJson: CircuitJson
let resistorFootprint: Footprint
let probePadFootprint: Footprint
let coveredPadFootprint: Footprint
let fiducialFootprint: Footprint
let kicadPcbString: string

beforeAll(async () => {
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
  circuitJson = circuit
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
  resistorFootprint = footprints.find((fp) =>
    fp.libraryLink?.startsWith("tscircuit:resistor"),
  )!
  probePadFootprint = probe!
  coveredPadFootprint = covered!
  fiducialFootprint = footprints.find((fp) =>
    fp.libraryLink?.startsWith("tscircuit:smtpad_circle"),
  )!
  kicadPcbString = converter.getOutputString()
})

test("repro37: pads with a pcb_solder_paste keep F.Paste", () => {
  expect(resistorFootprint.fpPads).toHaveLength(2)
  for (const pad of resistorFootprint.fpPads) {
    expect(pad.layers?.layers).toEqual(["F.Cu", "F.Paste", "F.Mask"])
  }
})

test("repro37: a pad without pcb_solder_paste gets no F.Paste", () => {
  expect(probePadFootprint.fpPads[0]!.layers?.layers).toEqual([
    "F.Cu",
    "F.Mask",
  ])
})

test("repro37: a covered pad gets no F.Mask opening", () => {
  expect(coveredPadFootprint.fpPads[0]!.layers?.layers).toEqual(["F.Cu"])
})

test("repro37: a fiducial keeps its F.Mask pullback opening", () => {
  expect(fiducialFootprint.fpPads[0]!.layers?.layers).toEqual([
    "F.Cu",
    "F.Mask",
  ])
})

test("repro37: circuit json without solder paste records keeps F.Paste", () => {
  const converter = new CircuitJsonToKicadPcbConverter(
    usbCC165948CircuitJson as CircuitJson,
  )
  converter.runUntilFinished()
  const pads = converter
    .getOutput()
    .footprints.flatMap((fp) => fp.fpPads)
    .filter((pad) => pad.padType === "smd")
  expect(pads.length).toBeGreaterThan(0)
  for (const pad of pads) {
    expect(pad.layers?.layers).toContain("F.Paste")
  }
})

test(
  "repro37: paste and mask layer snapshot",
  async () => {
    const kicadSnapshot = await takeKicadSnapshot({
      kicadFileContent: kicadPcbString,
      kicadFileType: "pcb",
      pcbLayers: ["F.Cu", "F.Mask", "F.Paste", "Edge.Cuts"],
    })
    expect(kicadSnapshot.exitCode).toBe(0)
    expect(
      await stackCircuitJsonKicadPngs(
        await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
        kicadSnapshot.generatedFileContent["temp_file.png"]!,
      ),
    ).toMatchPngSnapshot(import.meta.path)
  },
  { timeout: 120000 },
)
