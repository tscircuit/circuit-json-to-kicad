import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import {
  CircuitJsonToKicadPcbConverter,
  resolveAndLoadKicad3dModelFiles,
} from "lib"

const CUSTOM_MODEL_URL =
  "https://example.com/models/custom-switch.step?token=abc#model"

const toArrayBuffer = (text: string) => {
  const bytes = new TextEncoder().encode(text)
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  )
}

test("resolved model file paths match generated KiCad PCB model paths", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="30mm" height="20mm">
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-5} />
      <chip
        name="SW1"
        footprint="tssop8"
        pcbX={5}
        cadModel={{
          stepUrl: CUSTOM_MODEL_URL,
          rotationOffset: { x: 0, y: 0, z: 0 },
        }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()

  const pcbConverter = new CircuitJsonToKicadPcbConverter(
    circuit.getCircuitJson(),
    {
      includeBuiltin3dModels: true,
      projectName: "my_project",
    },
  )
  pcbConverter.runUntilFinished()

  const outputPaths: string[] = []
  await resolveAndLoadKicad3dModelFiles({
    projectName: "my_project",
    model3dSourcePaths: pcbConverter.getModel3dSourcePaths(),
    fetch: async (modelPath) => ({
      ok: true,
      arrayBuffer: async () => toArrayBuffer(modelPath),
    }),
    onModelFile: ({ outputPath }) => {
      outputPaths.push(outputPath)
    },
  })

  expect(outputPaths).toEqual([
    "3dmodels/tscircuit_builtin.3dshapes/res0402.step",
    "3dmodels/my_project.3dshapes/custom-switch.step",
  ])

  const pcbContent = pcbConverter.getOutputString()
  for (const outputPath of outputPaths) {
    expect(pcbContent).toContain(`\${KIPRJMOD}/${outputPath}`)
  }
})

test("loads local model files with readFile", async () => {
  const loadedFiles: Array<{ outputPath: string; content: string }> = []

  await resolveAndLoadKicad3dModelFiles({
    projectName: "my_project",
    model3dSourcePaths: ["/tmp/local-switch.step"],
    fetch: async (modelPath) => ({
      ok: true,
      arrayBuffer: async () => toArrayBuffer(modelPath),
    }),
    readFile: async () => new TextEncoder().encode("local model"),
    onModelFile: ({ outputPath, content }) => {
      loadedFiles.push({
        outputPath,
        content: new TextDecoder().decode(content),
      })
    },
  })

  expect(loadedFiles).toEqual([
    {
      outputPath: "3dmodels/my_project.3dshapes/local-switch.step",
      content: "local model",
    },
  ])
})

test("calls onError and continues when a model file cannot be loaded", async () => {
  const outputPaths: string[] = []
  const failedSourcePaths: string[] = []

  await resolveAndLoadKicad3dModelFiles({
    projectName: "my_project",
    model3dSourcePaths: [
      "https://example.com/models/missing.step",
      CUSTOM_MODEL_URL,
    ],
    fetch: async (modelPath) => ({
      ok: modelPath === CUSTOM_MODEL_URL,
      arrayBuffer: async () => toArrayBuffer(modelPath),
    }),
    onModelFile: ({ outputPath }) => {
      outputPaths.push(outputPath)
    },
    onError: ({ sourcePath }) => {
      failedSourcePaths.push(sourcePath)
    },
  })

  expect(failedSourcePaths).toEqual(["https://example.com/models/missing.step"])
  expect(outputPaths).toEqual([
    "3dmodels/my_project.3dshapes/custom-switch.step",
  ])
})

test("different model sources with the same basename remain distinct when packaged (#531)", async () => {
  const urls = [
    "https://example.com/left/body.step",
    "https://example.com/right/body.step",
  ]
  const circuit = new Circuit()
  circuit.add(
    <board width={30} height={20}>
      <chip
        name="U1"
        pcbX={-5}
        footprint="tssop8"
        cadModel={{ stepUrl: urls[0]! }}
      />
      <chip
        name="U2"
        pcbX={5}
        footprint="tssop8"
        cadModel={{ stepUrl: urls[1]! }}
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(
    circuit.getCircuitJson(),
    { includeBuiltin3dModels: true, projectName: "example" },
  )
  converter.runUntilFinished()
  expect(converter.getModel3dSourcePaths()).toEqual(urls)
  const writes: Array<{ source: string; path: string }> = []
  const files = new Map<string, Uint8Array>()
  await resolveAndLoadKicad3dModelFiles({
    projectName: "example",
    model3dSourcePaths: converter.getModel3dSourcePaths(),
    fetch: async (url) => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([urls.indexOf(url) + 1]).buffer,
    }),
    onModelFile: ({ sourcePath, outputPath, content }) => {
      writes.push({ source: sourcePath, path: outputPath })
      files.set(outputPath, content)
    },
  })
  expect(writes.map((write) => write.source)).toEqual(urls)
  expect(files.size).toBe(2)
  const models = converter
    .getOutput()
    .footprints.flatMap((fp) => fp.models.map((model) => model.path))
  expect(new Set(models).size).toBe(2)
})

test("hint-derived KiCad pad number does not collide with real pin number (#535)", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm" routingDisabled>
      <chip
        name="U1"
        pcbX={0}
        pcbY={0}
        footprint={
          <footprint>
            <smtpad
              portHints={["pin1"]}
              pcbX="-1mm"
              pcbY="0mm"
              width="0.3mm"
              height="0.3mm"
              shape="rect"
            />
            <smtpad
              portHints={["1"]}
              pcbX="1mm"
              pcbY="0mm"
              width="0.3mm"
              height="0.3mm"
              shape="rect"
            />
          </footprint>
        }
      />
    </board>,
  )

  await circuit.renderUntilSettled()
  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson())
  converter.runUntilFinished()
  const padNumbers = converter
    .getOutput()
    .footprints.flatMap((fp) =>
      fp.fpPads.map((pad) => pad.number).filter((num) => num !== ""),
    )
  expect(padNumbers).toEqual(["1", "2"])
})
