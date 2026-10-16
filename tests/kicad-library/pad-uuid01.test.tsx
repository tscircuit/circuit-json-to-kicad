import { expect, test } from "bun:test"
import { Circuit } from "tscircuit"
import { Footprint } from "kicadts"
import { KicadLibraryConverter } from "lib/kicad-library/KicadLibraryConverter"

test("library pads sharing a pin number have distinct deterministic UUIDs", async () => {
  const circuit = new Circuit()
  circuit.add(
    <board width={20} height={20}>
      <chip
        name="U1"
        footprint={
          <footprint>
            <smtpad
              portHints={["pin1"]}
              pcbX={-2}
              pcbY={0}
              width={1}
              height={1}
              shape="rect"
            />
            <smtpad
              portHints={["pin1"]}
              pcbX={0}
              pcbY={0}
              width={1}
              height={1}
              shape="rect"
            />
            <smtpad
              portHints={["pin2"]}
              pcbX={2}
              pcbY={0}
              width={1}
              height={1}
              shape="rect"
            />
            <hole pcbX={-2} pcbY={3} diameter={1} />
            <hole pcbX={2} pcbY={3} diameter={1} />
          </footprint>
        }
      />
    </board>,
  )
  await circuit.renderUntilSettled()
  const render = async () => {
    const converter = new KicadLibraryConverter({
      kicadLibraryName: "test_lib",
      entrypoint: "lib/test_lib.ts",
      getExportsFromTsxFile: async () => ["SharedPin"],
      buildFileToCircuitJson: async () => circuit.getCircuitJson(),
      includeBuiltins: true,
    })
    await converter.run()
    const text =
      converter.getOutput().kicadProjectFsMap[
        "footprints/test_lib.pretty/SharedPin.kicad_mod"
      ]
    expect(typeof text).toBe("string")
    return Footprint.parse(text as string)[0] as Footprint
  }
  const first = await render()
  expect(first.fpPads).toHaveLength(5)
  expect(first.fpPads.map((pad) => pad.number)).toEqual(["1", "1", "2", "", ""])
  const ids = first.fpPads.map((pad) => pad.uuid?.value)
  expect(ids.every(Boolean)).toBe(true)
  expect(new Set(ids).size).toBe(5)
  expect((await render()).fpPads.map((pad) => pad.uuid?.value)).toEqual(ids)
})
