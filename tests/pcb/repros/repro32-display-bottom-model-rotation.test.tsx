import { $ } from "bun"
import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { gunzipSync } from "node:zlib"
import sharp from "sharp"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib"
import { HS154L03W2C01 } from "./assets/hs154l03w2c01"

// Characterization repro: the bottom snapshot intentionally records the defect.
// See repro32-display-bottom-model-rotation.md for expected behavior/provenance.
test("pcb repro32 bottom display shows its back instead of its screen", async () => {
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
      exportedModel: model.getString(),
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
  }
  expect(observations).toMatchSnapshot()
}, 120_000)
