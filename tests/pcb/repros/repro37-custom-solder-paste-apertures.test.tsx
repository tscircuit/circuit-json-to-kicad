import { expect, test } from "bun:test"
import { convertCircuitJsonToPcbSvg } from "circuit-to-svg"
import type {
  CircuitJson,
  PcbSolderPaste,
  PcbSolderPasteRotatedRect,
} from "circuit-json"
import { KicadPcb, PadPrimitiveGrPoly } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import sharp from "sharp"
import { Circuit } from "tscircuit"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"

const CustomSolderPasteApertures = () => (
  <board width="32mm" height="18mm" routingDisabled schematicDisabled>
    <chip
      name="U_LINKED"
      pcbX={-9}
      footprint={
        <footprint>
          <smtpad
            shape="rect"
            width={4}
            height={3}
            solderPasteMargin={-0.5}
            portHints={["1"]}
          />
        </footprint>
      }
    />

    <chip
      name="U_WINDOWED"
      pcbX={2}
      footprint={
        <footprint>
          <smtpad
            shape="rect"
            width={5}
            height={5}
            noSolderPaste
            portHints={["1"]}
          />
          <solderpaste
            shape="rect"
            width={1.5}
            height={1.5}
            pcbX={-1}
            pcbY={-1}
          />
          <solderpaste
            shape="rect"
            width={1.5}
            height={1.5}
            pcbX={1}
            pcbY={-1}
          />
          <solderpaste
            shape="rect"
            width={1.5}
            height={1.5}
            pcbX={-1}
            pcbY={1}
          />
          <solderpaste
            shape="rect"
            width={1.5}
            height={1.5}
            pcbX={1}
            pcbY={1}
          />
        </footprint>
      }
    />

    <solderpaste shape="circle" radius={1} pcbX={11} />

    <chip
      name="U_CONCAVE"
      pcbX={11}
      pcbY={-4}
      pcbRotation={30}
      footprint={
        <footprint>
          <smtpad
            shape="polygon"
            points={[
              { x: -2, y: -2 },
              { x: 2, y: -2 },
              { x: 2, y: -1 },
              { x: -1, y: -1 },
              { x: -1, y: 1 },
              { x: 2, y: 1 },
              { x: 2, y: 2 },
              { x: -2, y: 2 },
            ]}
            solderPasteMargin={0}
            portHints={["1"]}
          />
        </footprint>
      }
    />

    <silkscreentext text="SHRUNK" pcbX={-9} pcbY={4} fontSize={0.65} />
    <silkscreentext text="4 WINDOWS" pcbX={2} pcbY={4} fontSize={0.65} />
    <silkscreentext text="STANDALONE" pcbX={11} pcbY={4} fontSize={0.65} />
    <silkscreentext text="CONCAVE" pcbX={11} pcbY={-7} fontSize={0.65} />
  </board>
)

const SolderPasteShapeVariants = () => (
  <board width="48mm" height="22mm" routingDisabled schematicDisabled>
    <chip
      name="U_PILL"
      pcbX={-18}
      pcbY={3}
      footprint={
        <footprint>
          <smtpad
            shape="pill"
            width={4}
            height={2}
            radius={1}
            solderPasteMargin={0}
            portHints={["1"]}
          />
        </footprint>
      }
    />
    <chip
      name="U_ROTATED_RECT"
      pcbX={-8}
      pcbY={3}
      footprint={
        <footprint>
          <smtpad
            shape="rotated_rect"
            width={4}
            height={1.5}
            ccwRotation={35}
            solderPasteMargin={0}
            portHints={["1"]}
          />
        </footprint>
      }
    />
    <chip
      name="U_ROTATED_PILL"
      pcbX={2}
      pcbY={3}
      footprint={
        <footprint>
          <smtpad
            shape="rotated_pill"
            width={4}
            height={1.5}
            radius={0.75}
            ccwRotation={-25}
            solderPasteMargin={0}
            portHints={["1"]}
          />
        </footprint>
      }
    />
    <chip
      name="U_BOTTOM_ROTATED"
      pcbX={-14}
      pcbY={-4}
      pcbRotation={30}
      layer="bottom"
      footprint={
        <footprint>
          <smtpad
            shape="rotated_rect"
            width={4}
            height={1.5}
            ccwRotation={20}
            solderPasteMargin={0}
            portHints={["1"]}
          />
        </footprint>
      }
    />

    <silkscreentext text="PILL" pcbX={-18} pcbY={6} fontSize={0.65} />
    <silkscreentext text="ROTATED RECT" pcbX={-8} pcbY={6} fontSize={0.65} />
    <silkscreentext text="ROTATED PILL" pcbX={2} pcbY={6} fontSize={0.65} />
    <silkscreentext text="OVAL" pcbX={12} pcbY={6} fontSize={0.65} />
    <silkscreentext
      text="BOTTOM + COMPONENT ROTATION"
      pcbX={-14}
      pcbY={-7}
      fontSize={0.65}
    />
    <silkscreentext text="TWO HOLES" pcbX={11} pcbY={-8} fontSize={0.65} />
  </board>
)

test("repro37: custom solder-paste aperture geometry is preserved", async () => {
  const circuit = new Circuit()
  circuit.add(<CustomSolderPasteApertures />)
  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const sourcePaste = circuitJson.filter(
    (element): element is PcbSolderPaste => element.type === "pcb_solder_paste",
  )
  expect(sourcePaste).toHaveLength(7)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const pcb = KicadPcb.parse(output)[0] as KicadPcb
  const exportedPastePads = pcb.footprints.flatMap((footprint) =>
    footprint.fpPads.filter((pad) =>
      pad.layers?.layers.some((layer) => layer.endsWith(".Paste")),
    ),
  )

  expect(
    exportedPastePads
      .map((pad) => ({
        shape: pad.shape,
        width: pad.size?.width,
        height: pad.size?.height,
        layers: pad.layers?.layers,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  ).toEqual([
    { shape: "circle", width: 2, height: 2, layers: ["F.Paste"] },
    { shape: "custom", width: 0.001, height: 0.001, layers: ["F.Paste"] },
    { shape: "rect", width: 1.5, height: 1.5, layers: ["F.Paste"] },
    { shape: "rect", width: 1.5, height: 1.5, layers: ["F.Paste"] },
    { shape: "rect", width: 1.5, height: 1.5, layers: ["F.Paste"] },
    { shape: "rect", width: 1.5, height: 1.5, layers: ["F.Paste"] },
    { shape: "rect", width: 3, height: 2, layers: ["F.Paste"] },
  ])

  const circuitJsonSvg = convertCircuitJsonToPcbSvg(circuitJson, {
    width: 900,
    height: 500,
    includeVersion: false,
    showCourtyards: false,
    showSolderPaste: true,
    colorOverrides: {
      copper: { top: "transparent", bottom: "transparent" },
    },
  })
  const circuitJsonSnapshot = await sharp(Buffer.from(circuitJsonSvg))
    .png()
    .toBuffer()
  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    generatePng: false,
    pcbLayers: ["F.Paste", "F.SilkS", "Edge.Cuts"],
  })
  expect(kicadSnapshot.exitCode).toBe(0)

  await expect(
    stackCircuitJsonKicadPngs(
      circuitJsonSnapshot,
      await sharp(kicadSnapshot.generatedFileContent["temp_file.svg"]!)
        .resize({ width: 900 })
        .flatten({ background: "black" })
        .png()
        .toBuffer(),
    ),
  ).toMatchPngSnapshot(import.meta.path)
}, 120_000)

test("repro37: polygon solder-paste apertures preserve holes", async () => {
  // Polygon holes are part of Circuit JSON but are not currently exposed by
  // the <solderpaste> JSX element, so this exercises that typed schema shape.
  const solderPaste = {
    type: "pcb_solder_paste",
    shape: "polygon",
    pcb_solder_paste_id: "pcb_solder_paste_with_hole",
    layer: "top",
    points: [
      { x: -3, y: -3 },
      { x: 3, y: -3 },
      { x: 3, y: 3 },
      { x: -3, y: 3 },
    ],
    holes: [
      [
        { x: -2, y: -2 },
        { x: -2, y: 2 },
        { x: 2, y: 2 },
        { x: 2, y: -2 },
      ],
    ],
  } satisfies PcbSolderPaste
  const circuitJson: CircuitJson = [solderPaste]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const pcb = KicadPcb.parse(output)[0] as KicadPcb
  const pastePad = pcb.footprints[0]?.fpPads[0]
  const graphics = pastePad?.primitives?.graphics ?? []

  expect(graphics.length).toBeGreaterThan(1)
  expect(
    graphics.every(
      (graphic) =>
        graphic instanceof PadPrimitiveGrPoly && graphic.contours.length === 1,
    ),
  ).toBe(true)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    generatePng: false,
    pcbLayers: ["F.Paste"],
  })
  expect(kicadSnapshot.exitCode).toBe(0)

  const circuitJsonSvg = convertCircuitJsonToPcbSvg(circuitJson, {
    width: 600,
    height: 400,
    includeVersion: false,
    showCourtyards: false,
    showSolderPaste: true,
  })
  await expect(
    stackCircuitJsonKicadPngs(
      await sharp(Buffer.from(circuitJsonSvg)).png().toBuffer(),
      await sharp(kicadSnapshot.generatedFileContent["temp_file.svg"]!)
        .resize({ width: 600 })
        .flatten({ background: "black" })
        .png()
        .toBuffer(),
    ),
  ).toMatchPngSnapshot(import.meta.path, "repro37-polygon-hole")
}, 120_000)

test("repro37: all solder-paste shapes, rotations and multiple holes", async () => {
  const circuit = new Circuit()
  circuit.add(<SolderPasteShapeVariants />)
  await circuit.renderUntilSettled()

  // JSX currently exposes the shapes above through <smtpad>. Circuit JSON
  // additionally supports oval apertures and polygon holes directly.
  const oval = {
    type: "pcb_solder_paste",
    shape: "oval",
    pcb_solder_paste_id: "pcb_solder_paste_oval",
    layer: "top",
    x: 12,
    y: 3,
    width: 4,
    height: 2,
  } satisfies PcbSolderPaste
  const polygonWithTwoHoles = {
    type: "pcb_solder_paste",
    shape: "polygon",
    pcb_solder_paste_id: "pcb_solder_paste_with_two_holes",
    layer: "top",
    points: [
      { x: 6, y: -7 },
      { x: 16, y: -7 },
      { x: 16, y: -1 },
      { x: 6, y: -1 },
    ],
    holes: [
      [
        { x: 7, y: -6 },
        { x: 9, y: -6 },
        { x: 9, y: -2 },
        { x: 7, y: -2 },
      ],
      [
        { x: 13, y: -6 },
        { x: 15, y: -6 },
        { x: 15, y: -2 },
        { x: 13, y: -2 },
      ],
    ],
  } satisfies PcbSolderPaste
  const circuitJson: CircuitJson = [
    ...circuit.getCircuitJson(),
    oval,
    polygonWithTwoHoles,
  ]
  const sourcePaste = circuitJson.filter(
    (element): element is PcbSolderPaste => element.type === "pcb_solder_paste",
  )
  expect(sourcePaste).toHaveLength(6)

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()
  const pcb = KicadPcb.parse(output)[0] as KicadPcb
  const exportedPastePads = pcb.footprints.flatMap((footprint) =>
    footprint.fpPads.filter((pad) =>
      pad.layers?.layers.some((layer) => layer.endsWith(".Paste")),
    ),
  )

  expect(exportedPastePads).toHaveLength(6)
  expect(
    exportedPastePads
      .map((pad) => ({ shape: pad.shape, layers: pad.layers?.layers }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  ).toEqual([
    { shape: "custom", layers: ["F.Paste"] },
    { shape: "custom", layers: ["F.Paste"] },
    { shape: "rect", layers: ["B.Paste"] },
    { shape: "rect", layers: ["F.Paste"] },
    { shape: "roundrect", layers: ["F.Paste"] },
    { shape: "roundrect", layers: ["F.Paste"] },
  ])

  const customPads = exportedPastePads.filter((pad) => pad.shape === "custom")
  const ellipsePad = customPads.find(
    (pad) =>
      pad.primitives?.graphics.length === 1 &&
      pad.primitives.graphics[0] instanceof PadPrimitiveGrPoly &&
      pad.primitives.graphics[0].contours[0]?.points.length === 64,
  )
  const twoHolePad = customPads.find(
    (pad) => (pad.primitives?.graphics.length ?? 0) > 1,
  )
  expect(ellipsePad).toBeDefined()
  expect(twoHolePad).toBeDefined()
  expect(
    twoHolePad?.primitives?.graphics.every(
      (graphic) =>
        graphic instanceof PadPrimitiveGrPoly && graphic.contours.length === 1,
    ),
  ).toBe(true)

  const bottomSourcePaste = sourcePaste.find(
    (paste): paste is PcbSolderPasteRotatedRect =>
      paste.layer === "bottom" && paste.shape === "rotated_rect",
  )
  const bottomExportedPad = exportedPastePads.find((pad) =>
    pad.layers?.layers.includes("B.Paste"),
  )
  expect(bottomExportedPad?.at?.angle).toBe(bottomSourcePaste?.ccw_rotation)

  const circuitJsonSvg = convertCircuitJsonToPcbSvg(circuitJson, {
    width: 1000,
    height: 500,
    includeVersion: false,
    showCourtyards: false,
    showSolderPaste: true,
    colorOverrides: {
      copper: { top: "transparent", bottom: "transparent" },
    },
  })
  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "pcb",
    generatePng: false,
    pcbLayers: ["F.Paste", "B.Paste", "F.SilkS", "Edge.Cuts"],
  })
  expect(kicadSnapshot.exitCode).toBe(0)

  await expect(
    stackCircuitJsonKicadPngs(
      await sharp(Buffer.from(circuitJsonSvg)).png().toBuffer(),
      await sharp(kicadSnapshot.generatedFileContent["temp_file.svg"]!)
        .resize({ width: 1000 })
        .flatten({ background: "black" })
        .png()
        .toBuffer(),
    ),
  ).toMatchPngSnapshot(import.meta.path, "repro37-shape-variants")
}, 120_000)
