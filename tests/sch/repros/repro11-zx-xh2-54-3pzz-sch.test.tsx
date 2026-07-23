import { expect, test } from "bun:test"
import type { ChipProps } from "@tscircuit/props"
import { Circuit } from "tscircuit"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"
import { takeKicadSnapshot } from "../../fixtures/take-kicad-snapshot"
import { takeCircuitJsonSnapshot } from "../../fixtures/take-circuit-json-snapshot"
import { stackCircuitJsonKicadPngs } from "../../fixtures/stackCircuitJsonKicadPngs"

const pinLabels = {
  pin1: ["pin1"],
  pin2: ["pin2"],
  pin3: ["pin3"],
} as const

const ZX_XH2_54_3PZZ = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      supplierPartNumbers={{
        jlcpcb: ["C7429633"],
      }}
      manufacturerPartNumber="ZX_XH2_54_3PZZ"
      footprint={
        <footprint>
          <platedhole
            portHints={["pin1"]}
            pcbX="-2.54mm"
            pcbY="0.000127mm"
            outerDiameter="1.5999968mm"
            holeDiameter="0.999998mm"
            shape="circle"
          />
          <platedhole
            portHints={["pin2"]}
            pcbX="-0mm"
            pcbY="-0.000127mm"
            outerDiameter="1.5999968mm"
            holeDiameter="0.999998mm"
            shape="circle"
          />
          <platedhole
            portHints={["pin3"]}
            pcbX="2.54mm"
            pcbY="-0.000127mm"
            outerDiameter="1.5999968mm"
            holeDiameter="0.999998mm"
            shape="circle"
          />
          <silkscreenpath
            route={[
              { x: -4.97992400000021, y: 3.3501329999999143 },
              { x: 5.020056000000068, y: 3.3501329999999143 },
            ]}
          />
          <silkscreenpath
            route={[
              { x: 5.020056000000068, y: 3.3501329999999143 },
              { x: 5.020056000000068, y: -2.3496269999999413 },
            ]}
          />
          <silkscreenpath
            route={[
              { x: 5.020056000000068, y: -2.3496269999999413 },
              { x: -4.97992400000021, y: -2.3496269999999413 },
            ]}
          />
          <silkscreenpath
            route={[
              { x: -4.97992400000021, y: -2.3496269999999413 },
              { x: -4.97992400000021, y: 3.3501329999999143 },
            ]}
          />
          <silkscreenpath
            route={[
              { x: -4.318000000000097, y: 2.5399999999999636 },
              { x: -4.318000000000097, y: -1.5240000000001146 },
              { x: 4.317999999999984, y: -1.5240000000001146 },
              { x: 4.317999999999984, y: 2.5399999999999636 },
              { x: -4.318000000000097, y: 2.5399999999999636 },
            ]}
          />
          <silkscreenpath
            route={[
              { x: -2.7940000000000964, y: -1.5240000000001146 },
              { x: -2.7940000000000964, y: -2.3496269999999413 },
            ]}
          />
          <silkscreenpath
            route={[
              { x: -2.278634000000011, y: -1.5240000000001146 },
              { x: -2.278634000000011, y: -2.3496269999999413 },
            ]}
          />
          <silkscreenpath
            route={[
              { x: 2.2679660000000013, y: -1.5240000000001146 },
              { x: 2.2679660000000013, y: -2.3496269999999413 },
            ]}
          />
          <silkscreenpath
            route={[
              { x: 2.7505659999999352, y: -1.5240000000001146 },
              { x: 2.7505659999999352, y: -2.3496269999999413 },
            ]}
          />
          <silkscreentext
            text="{NAME}"
            pcbX="0mm"
            pcbY="4.421253mm"
            anchorAlignment="center"
            fontSize="1mm"
          />
          <courtyardoutline
            outline={[
              { x: -5.330000000000155, y: 3.671252999999979 },
              { x: 5.329999999999927, y: 3.671252999999979 },
              { x: 5.329999999999927, y: -2.746947000000091 },
              { x: -5.330000000000155, y: -2.746947000000091 },
              { x: -5.330000000000155, y: 3.671252999999979 },
            ]}
          />
        </footprint>
      }
      cadModel={{
        objUrl:
          "https://modelcdn.tscircuit.com/easyeda_models/assets/C7429633.obj?uuid=086fcab2d8124db5931a28c539f75702",
        stepUrl:
          "https://modelcdn.tscircuit.com/easyeda_models/assets/C7429633.step?uuid=086fcab2d8124db5931a28c539f75702",
        pcbRotationOffset: 0,
        modelOriginPosition: {
          x: 0,
          y: -0.00001189999998141289,
          z: -0.000006999999999646178,
        },
      }}
      {...props}
    />
  )
}

test("repro11 ZX_XH2_54_3PZZ schematic snapshot", async () => {
  const circuit = new Circuit()

  circuit.add(
    <board width="80mm" height="40mm">
      <ZX_XH2_54_3PZZ
        name="J_TEMP"
        pcbX={-30}
        pcbY={7.5}
        pcbRotation={90}
        schX={-7}
        schY={2}
      />
    </board>,
  )

  await circuit.renderUntilSettled()

  const circuitJson = circuit.getCircuitJson()
  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  Bun.write("./debug-output/repro11-zx-xh2-54-3pzz-sch.kicad_sch", output)

  const kicadSnapshot = await takeKicadSnapshot({
    kicadFileContent: output,
    kicadFileType: "sch",
  })

  expect(output).toContain('(property "Reference" "J_TEMP"')
  expect(output).not.toContain('(property "Reference" "U?"')

  expect(
    stackCircuitJsonKicadPngs(
      await takeCircuitJsonSnapshot({
        circuitJson,
        outputType: "schematic",
      }),
      kicadSnapshot.generatedFileContent["temp_file.png"]!,
    ),
  ).toMatchPngSnapshot(import.meta.path)
})
