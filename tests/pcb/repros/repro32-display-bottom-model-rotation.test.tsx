import { $ } from "bun"
import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { gunzipSync } from "node:zlib"
import sharp from "sharp"
import looksSame from "looks-same"
import {
  convertCircuitJsonToGltf,
  getBestCameraPosition,
} from "circuit-json-to-gltf"
import { renderGLTFToPNGFromGLB } from "poppygl"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib"
import { HS154L03W2C01 } from "./assets/hs154l03w2c01"

test("pcb repro32 display screen faces outward on both board sides", async () => {
  // C7465999.step.gz and C7465999.obj.gz are losslessly compressed originals
  // from the modelcdn.tscircuit.com URLs (including asset UUID) in
  // assets/hs154l03w2c01.tsx. SHA-256 assertions below verify decompressed bytes.
  const compressed = await Bun.file(
    resolve(import.meta.dir, "assets/C7465999.step.gz"),
  ).arrayBuffer()
  const step = gunzipSync(Buffer.from(compressed))
  expect(createHash("sha256").update(step).digest("hex")).toBe(
    "5d32c3497644bfdf5a348d3f98cf159a9a7a54f7fc51bd9a5579c3682b93c77d",
  )
  const modelPath = resolve("debug-output/repro32/C7465999.step")
  await Bun.write(modelPath, step)
  const version = await $`kicad-cli --version`.text()
  expect(version.trim().startsWith("10.")).toBe(true)

  const observations = []
  for (const layer of ["top", "bottom"] as const) {
    const circuit = new Circuit()
    circuit.add(
      <board width="70mm" height="70mm" thickness="1.4mm" routingDisabled>
        <HS154L03W2C01 name="DS1" pcbY={2} pcbRotation={180} layer={layer} />
      </board>,
    )
    await circuit.renderUntilSettled()
    const circuitJson = circuit.getCircuitJson()
    const component = circuitJson.find((e) => e.type === "pcb_component")!
    const cad = circuitJson.find((e) => e.type === "cad_component")!
    expect(component.layer).toBe(layer)
    expect(component.rotation).toBe(180)
    expect(cad.model_step_url).toContain("C7465999.step")
    expect(cad.rotation).toEqual({ x: 0, y: layer === "top" ? 0 : 180, z: 180 })

    const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
    converter.runUntilFinished()
    const pcb = converter.getOutput()
    expect(pcb.footprints).toHaveLength(1)
    const footprint = pcb.footprints[0]!
    expect(footprint.fpPads).toHaveLength(8)
    expect(footprint.models).toHaveLength(1)
    const model = footprint.models[0]!
    // For this display, top placement cancels the footprint's 180° rotation.
    // Bottom placement additionally needs a local 180° Z rotation to undo
    // KiCad's back-side flip. It reverses the origin's X/Y offset signs.
    expect(model.rotate).toEqual({ x: 0, y: 0, z: layer === "top" ? 0 : -180 })
    const offsetSign = layer === "top" ? 1 : -1
    expect(model.offset!.x).toBeCloseTo(offsetSign * 0.0000254, 10)
    expect(model.offset!.y).toBeCloseTo(offsetSign * 0.00508, 10)
    expect(model.offset!.z).toBeCloseTo(8.480406, 10)
    expect(footprint.layer?.getString()).toContain(
      layer === "top" ? "F.Cu" : "B.Cu",
    )

    // Substitute only the model file path for offline KiCad loading. Preserve
    // the exported offset, rotation, scale, and footprint placement unchanged.
    model.path = "C7465999.step"
    observations.push({
      layer,
      pcbRotation: component.rotation,
      inputCadRotation: cad.rotation,
      inputCadPosition: cad.position,
      exportedModel: model.getString().split("\n"),
    })
    const stem = resolve(`debug-output/repro32/display-${layer}`)
    await Bun.write(
      `${stem}.circuit.json`,
      JSON.stringify(circuitJson, null, 2),
    )
    // KIPRJMOD resolves relative to the generated board for manual inspection.
    model.path = "${KIPRJMOD}/C7465999.step"
    await Bun.write(`${stem}.kicad_pcb`, converter.getOutputString())
    await $`kicad-cli pcb render ${`${stem}.kicad_pcb`} --side ${layer} --width 800 --height 600 --zoom 0.8 --quality basic -o ${`${stem}.png`}`.quiet()
    // Normalize raytraced edge variation; model presence/orientation is visible
    // at this size. Structural snapshots preserve the exact transform values.
    const image = await sharp(`${stem}.png`)
      .flatten({ background: "#ffffff" })
      .resize(400, 300)
      .blur(1)
      .png()
      .toBuffer()
    await expect(image).toMatchPngSnapshot(
      import.meta.path,
      `repro32-display-${layer}-3d`,
    )
    if (layer === "bottom") {
      const obj = gunzipSync(
        Buffer.from(
          await Bun.file(
            resolve(import.meta.dir, "assets/C7465999.obj.gz"),
          ).arrayBuffer(),
        ),
      )
      expect(createHash("sha256").update(obj).digest("hex")).toBe(
        "ce0b0ecc6fef408bdcbec0eac616edd09fd2cec2a45f9e6939de632fe9af2ab8",
      )
      // Serve the original model offline; only its URL changes in the copy.
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: () =>
          new Response(obj, { headers: { "Content-Type": "text/plain" } }),
      })
      let reference: Buffer
      try {
        const renderJson = structuredClone(circuitJson)
        renderJson.find((e) => e.type === "cad_component")!.model_obj_url =
          `${server.url}display.obj`
        const glb = await convertCircuitJsonToGltf(renderJson, {
          format: "glb",
          includeModels: true,
          showBoundingBoxes: false,
          boardTextureResolution: 1024,
        })
        const camera = getBestCameraPosition(renderJson, {
          preset: "bottom_up",
          ortho: true,
          aspectRatio: 4 / 3,
        })
        const png = await renderGLTFToPNGFromGLB(glb as Uint8Array, {
          width: 800,
          height: 600,
          ...camera,
          backgroundColor: [255, 255, 255],
          grid: false,
        })
        reference = await sharp(png).resize(400, 300).blur(1).png().toBuffer()
      } finally {
        server.stop(true)
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="664" viewBox="0 0 400 664">
<rect width="400" height="664" fill="white"/>
<g font-family="sans-serif" font-size="18" fill="black">
<text x="12" y="23">Circuit JSON — bottom view</text>
<text x="12" y="355">KiCad — bottom view</text>
</g>
<image x="0" y="32" width="400" height="300" href="data:image/png;base64,${reference.toString("base64")}"/>
<image x="0" y="364" width="400" height="300" href="data:image/png;base64,${image.toString("base64")}"/>
</svg>`
      await Bun.write(
        resolve("debug-output/repro32/display-bottom-comparison.svg"),
        svg,
      )
      const snapshot = Bun.file(
        resolve(
          import.meta.dir,
          "__snapshots__/repro32-display-bottom-comparison.snap.svg",
        ),
      )
      if (process.env.BUN_UPDATE_SNAPSHOTS || !(await snapshot.exists())) {
        await Bun.write(snapshot, svg)
      } else {
        const expected = await sharp(Buffer.from(await snapshot.text()))
          .png()
          .toBuffer()
        const received = await sharp(Buffer.from(svg)).png().toBuffer()
        const comparison = await looksSame(expected, received, {
          strict: false,
          tolerance: 5,
          antialiasingTolerance: 4,
        })
        expect(comparison.equal).toBe(true)
      }
    }
  }
  expect(observations).toMatchSnapshot()
}, 120_000)
