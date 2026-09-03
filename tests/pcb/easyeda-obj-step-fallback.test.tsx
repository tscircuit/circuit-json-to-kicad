import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadPcbConverter } from "lib"

test("EasyEDA STEP fallback is restricted to known CDN URLs and respects explicit STEP models", async () => {
  const cases = [
    {
      objUrl:
        "https://modelcdn.tscircuit.com/easyeda_models/assets/C165948.obj?uuid=test&cachebust_origin=",
      expected:
        "https://modelcdn.tscircuit.com/easyeda_models/assets/C165948.step?uuid=test",
    },
    {
      objUrl:
        "https://modelcdn.tscircuit.com/easyeda_models/download?pn=C165948&uuid=test",
      expected:
        "https://modelcdn.tscircuit.com/easyeda_models/assets/C165948.step?uuid=test",
    },
    {
      objUrl: "https://example.com/easyeda_models/assets/C165948.obj",
      expected: undefined,
    },
    {
      objUrl:
        "https://modelcdn.tscircuit.com.example.com/easyeda_models/assets/C165948.obj",
      expected: undefined,
    },
    {
      objUrl: "https://modelcdn.tscircuit.com/unrelated/model.obj",
      expected: undefined,
    },
    {
      objUrl:
        "https://modelcdn.tscircuit.com/easyeda_models/download?uuid=test",
      expected: undefined,
    },
    { objUrl: "not-a-url", expected: undefined },
    {
      objUrl:
        "https://modelcdn.tscircuit.com/easyeda_models/assets/C165948.obj",
      stepUrl: "https://example.com/explicit.step",
      expected: "https://example.com/explicit.step",
    },
  ]
  for (const { expected, ...cadModel } of cases) {
    const circuit = new Circuit()
    circuit.add(
      <board width="20mm" height="20mm">
        <chip name="J1" footprint="soic8" cadModel={cadModel} />
      </board>,
    )
    await circuit.renderUntilSettled()
    const converter = new CircuitJsonToKicadPcbConverter(
      circuit.getCircuitJson(),
    )
    converter.runUntilFinished()
    const models = converter.getOutput().footprints[0]!.models
    expect(models).toHaveLength(expected ? 1 : 0)
    if (expected)
      expect(
        models[0]!.path
          ?.split("&cachebust_origin")[0]
          ?.split("?cachebust_origin")[0],
      ).toBe(expected)
  }
})
