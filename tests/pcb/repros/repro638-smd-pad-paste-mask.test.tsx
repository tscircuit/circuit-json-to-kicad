import { expect, test } from "bun:test"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
import sharp from "sharp"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const Repro638SmdPadPasteMask = () => (
  <board width="26mm" height="18mm" routingDisabled schematicDisabled>
    <chip
      name="J1"
      pcbY={3}
      footprint={
        <footprint>
          <smtpad
            shape="rect"
            width={2}
            height={2}
            solderPasteMargin={0}
            pcbX={-7}
            portHints={["1"]}
          />
          <smtpad
            shape="polygon"
            points={[
              { x: -1, y: -1 },
              { x: 1, y: -1 },
              { x: 1.5, y: 0 },
              { x: 1, y: 1 },
              { x: -1, y: 1 },
            ]}
            noSolderPaste
            portHints={["2"]}
          />
          <smtpad
            shape="circle"
            radius={1}
            pcbX={7}
            coveredWithSolderMask
            portHints={["3"]}
          />
        </footprint>
      }
    />
    <smtpad
      shape="rect"
      width={2}
      height={2}
      solderPasteMargin={0}
      pcbX={-7}
      pcbY={-3}
      layer="bottom"
    />
    <smtpad
      shape="polygon"
      points={[
        { x: -1, y: -1 },
        { x: 1, y: -1 },
        { x: 1.5, y: 0 },
        { x: 1, y: 1 },
        { x: -1, y: 1 },
      ]}
      pcbY={-3}
      layer="bottom"
      noSolderPaste
    />
    <smtpad
      shape="circle"
      radius={1}
      pcbX={7}
      pcbY={-3}
      layer="bottom"
      coveredWithSolderMask
    />
    <silkscreentext text="SOLDERED" pcbX={-7} pcbY={7} fontSize={0.7} />
    <silkscreentext text="PROBE" pcbX={0} pcbY={7} fontSize={0.7} />
    <silkscreentext text="COVERED" pcbX={7} pcbY={7} fontSize={0.7} />
    <silkscreentext text="TOP / FOOTPRINT" pcbY={5.5} fontSize={0.65} />
    <silkscreentext text="BOTTOM / STANDALONE" pcbY={-0.5} fontSize={0.65} />
    <silkscreentext
      text="Probe: exposed copper, no paste"
      pcbY={-5.5}
      fontSize={0.6}
    />
    <silkscreentext
      text="Paste shapes = stencil openings"
      pcbY={-6.7}
      fontSize={0.6}
    />
    <silkscreentext
      text="Mask shapes = exposed copper"
      pcbY={-7.9}
      fontSize={0.6}
    />
  </board>
)

export default Repro638SmdPadPasteMask

test("pcb repro638 SMD pad paste and mask layers", async () => {
  const circuit = new Circuit()
  circuit.add(<Repro638SmdPadPasteMask />)
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const pads = circuitJson.filter((element) => element.type === "pcb_smtpad")
  const paste = circuitJson.filter(
    (element) => element.type === "pcb_solder_paste",
  )

  // Only the normal pad in each row has paste in the source design.
  expect(pads).toHaveLength(6)
  expect(paste).toHaveLength(2)
  for (const pad of pads) {
    expect(
      paste.some((element) => element.pcb_smtpad_id === pad.pcb_smtpad_id),
    ).toBe(pad.shape === "rect")
    expect(pad.is_covered_with_solder_mask ?? false).toBe(
      pad.shape === "circle",
    )
  }

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const pcb = KicadPcb.parse(output)[0] as KicadPcb

  // Capture the exported layers as well as the artwork. On main, the probe
  // polygons incorrectly have paste and the covered circles have mask openings.
  expect(
    pcb.footprints.flatMap((footprint) =>
      footprint.fpPads.map((pad) => ({
        shape: pad.shape,
        layers: pad.layers?.layers,
      })),
    ),
  ).toMatchSnapshot()

  // Compare the source renderer with KiCad's native layer plots. The copper
  // view keeps all six pads visible; paste and mask views show only openings.
  for (const layer of ["Cu", "Paste", "Mask"]) {
    const circuitJsonSnapshot = await takeCircuitJsonSnapshot({
      circuitJson,
      outputType: "pcb",
      pcbOptions: {
        width: 800,
        height: 600,
        includeVersion: false,
        showCourtyards: false,
        showSolderPaste: layer === "Paste",
        showSolderMask: layer === "Mask",
        // Isolate paste by hiding copper. In the mask view, paint covered
        // areas like the background so exposed copper represents openings.
        colorOverrides: {
          copper:
            layer === "Paste"
              ? { top: "transparent", bottom: "transparent" }
              : undefined,
          soldermask: { top: "black", bottom: "black" },
          soldermaskWithCopperUnderneath: { top: "black", bottom: "black" },
        },
      },
    })
    const snapshot = await takeKicadSnapshot({
      kicadFileContent: output,
      kicadFileType: "pcb",
      generatePng: false,
      pcbLayers: [`F.${layer}`, `B.${layer}`, "F.SilkS", "Edge.Cuts"],
    })
    expect(snapshot.exitCode).toBe(0)
    await expect(
      stackCircuitJsonKicadPngs(
        circuitJsonSnapshot,
        await sharp(snapshot.generatedFileContent["temp_file.svg"]!)
          .resize({ width: 800 })
          .flatten({ background: "black" })
          .png()
          .toBuffer(),
      ),
    ).toMatchPngSnapshot(
      import.meta.path,
      `repro638-smd-pad-${layer.toLowerCase()}`,
    )
  }
}, 120_000)
