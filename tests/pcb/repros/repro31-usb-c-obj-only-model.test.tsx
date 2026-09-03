import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { gunzipSync } from "node:zlib"
import sharp from "sharp"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { SmdUsbC } from "./assets/smd-usb-c-obj-only"

test("pcb repro31 derives and embeds an EasyEDA STEP sibling for OBJ-only USB-C", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="20mm" routingDisabled>
      <SmdUsbC
        name="J1"
        pcbY={-6}
        layer="top"
        connections={{
          A1: "net.GND",
          B12: "net.GND",
          A12: "net.GND",
          B1: "net.GND",
          A4: "net.VBUS",
          B9: "net.VBUS",
          A9: "net.VBUS",
          B4: "net.VBUS",
        }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const circuitJson = circuit.getCircuitJson()
  const cad = circuitJson.find((e) => e.type === "cad_component")!
  expect(cad).toBeDefined()
  expect(cad.model_obj_url).toContain("2a4bc2358b36497d9ab2a66ab6419ba3")
  expect(cad.model_step_url).toBeUndefined()
  expect(cad.model_wrl_url).toBeUndefined()
  expect(cad.footprinter_string).toBeUndefined()

  // Enable model packaging so the repro is not caused by its default being off.
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson, {
    includeBuiltin3dModels: true,
    projectName: "usb-c-obj-only",
  })
  converter.runUntilFinished()
  const pcb = converter.getOutput()
  expect(pcb.footprints).toHaveLength(1)
  expect(pcb.footprints[0]!.fpPads).toHaveLength(22)
  expect(pcb.footprints[0]!.models).toHaveLength(1)
  const stepUrl =
    "https://modelcdn.tscircuit.com/easyeda_models/assets/C165948.step"
  expect(converter.getModel3dSourcePaths()).toEqual([stepUrl])
  expect(converter.getOutputString()).toContain(
    "${KIPRJMOD}/3dmodels/tscircuit_builtin.3dshapes/C165948.step",
  )
  expect({
    inputHasObj: Boolean(cad.model_obj_url),
    inputHasStep: Boolean(cad.model_step_url),
    inputHasWrl: Boolean(cad.model_wrl_url),
    exportedFootprints: pcb.footprints.length,
    exportedPads: pcb.footprints[0]!.fpPads.length,
    exportedModels: pcb.footprints[0]!.models.length,
    exportedModelPath: pcb.footprints[0]!.models[0]!.path,
    modelDownloads: converter.getModel3dSourcePaths(),
  }).toMatchSnapshot()

  const compressed = await Bun.file(
    resolve(import.meta.dir, "assets/C165948.step.gz"),
  ).arrayBuffer()
  const step = gunzipSync(Buffer.from(compressed))
  expect(createHash("sha256").update(step).digest("hex")).toBe(
    "3806dacd6082a75cfb24d3ba4b86b3d0c96213134c67e1385eb1599a89b2c461",
  )
  const projectDir = resolve("debug-output/repro31")
  const modelDir = resolve(projectDir, "3dmodels/tscircuit_builtin.3dshapes")
  await Bun.write(resolve(modelDir, "C165948.step"), step)
  const pcbPath = resolve(projectDir, "usb-c-obj-only.kicad_pcb")
  await Bun.write(pcbPath, converter.getOutputString())
  await expect(
    await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
  ).toMatchPngSnapshot(import.meta.path, "repro31-usb-c-input-pcb")
  const rendered = await takeKicadSnapshot({
    kicadFilePath: pcbPath,
    kicadFileType: "3d",
  })
  await expect(
    await sharp(rendered.generatedFileContent["temp_file.png"]!)
      .flatten({ background: "#ffffff" })
      .resize(400, 300)
      .blur(1)
      .png()
      .toBuffer(),
  ).toMatchPngSnapshot(import.meta.path, "repro31-usb-c-kicad-3d-model")
}, 120_000)
