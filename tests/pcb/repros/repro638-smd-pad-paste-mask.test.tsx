import { expect, test } from "bun:test"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { Circuit } from "tscircuit"
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
    <silkscreentext text="NORMAL" pcbX={-7} pcbY={7} fontSize={0.8} />
    <silkscreentext text="NO PASTE" pcbX={0} pcbY={7} fontSize={0.8} />
    <silkscreentext text="COVERED" pcbX={7} pcbY={7} fontSize={0.8} />
    <silkscreentext text="TOP / FOOTPRINT" pcbY={5.5} fontSize={0.65} />
    <silkscreentext text="BOTTOM / STANDALONE" pcbY={-0.5} fontSize={0.65} />
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

  // The standard PCB snapshot hides these manufacturing layers. Plot each
  // separately: paste should show only NORMAL, mask only NORMAL and NO PASTE.
  for (const layer of ["Paste", "Mask"]) {
    const snapshot = await takeKicadSnapshot({
      kicadFileContent: output,
      kicadFileType: "pcb",
      pcbLayers: [`F.${layer}`, `B.${layer}`, "F.SilkS", "Edge.Cuts"],
    })
    expect(snapshot.exitCode).toBe(0)
    await expect(
      snapshot.generatedFileContent["temp_file.png"]!,
    ).toMatchPngSnapshot(
      import.meta.path,
      `repro638-smd-pad-${layer.toLowerCase()}`,
    )
  }
}, 120_000)
