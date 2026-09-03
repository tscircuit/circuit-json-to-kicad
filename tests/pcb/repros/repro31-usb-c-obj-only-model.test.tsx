import { expect, test } from "bun:test"
import sharp from "sharp"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { SmdUsbC } from "./assets/smd-usb-c-obj-only"

// Characterization repro: passing means the model omission was reproduced,
// not that export is correct. See repro31-usb-c-obj-only-model.md.
test("pcb repro31 OBJ-only USB-C keeps pads but drops its 3D model", async () => {
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
  expect(pcb.footprints[0]!.models).toHaveLength(0)
  expect(converter.getModel3dSourcePaths()).toEqual([])
  expect(converter.getOutputString()).not.toContain("(model ")
  expect({
    inputHasObj: Boolean(cad.model_obj_url),
    inputHasStep: Boolean(cad.model_step_url),
    inputHasWrl: Boolean(cad.model_wrl_url),
    exportedFootprints: pcb.footprints.length,
    exportedPads: pcb.footprints[0]!.fpPads.length,
    exportedModels: pcb.footprints[0]!.models.length,
    modelDownloads: converter.getModel3dSourcePaths(),
  }).toMatchSnapshot()

  await Bun.write(
    "debug-output/repro31-usb-c-obj-only.circuit.json",
    JSON.stringify(circuitJson, null, 2),
  )
  await Bun.write(
    "debug-output/repro31-usb-c-obj-only.kicad_pcb",
    converter.getOutputString(),
  )
  await expect(
    await takeCircuitJsonSnapshot({ circuitJson, outputType: "pcb" }),
  ).toMatchPngSnapshot(import.meta.path, "repro31-usb-c-input-pcb")
  const rendered = await takeKicadSnapshot({
    kicadFileContent: converter.getOutputString(),
    kicadFileType: "3d",
  })
  await expect(
    await sharp(rendered.generatedFileContent["temp_file.png"]!)
      .flatten({ background: "#ffffff" })
      .resize(400, 300)
      .blur(1)
      .png()
      .toBuffer(),
  ).toMatchPngSnapshot(import.meta.path, "repro31-usb-c-kicad-3d-missing-model")
}, 120_000)
