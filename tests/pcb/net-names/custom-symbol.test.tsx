import { expect, test } from "bun:test"
import { render, expectNativeParity } from "../../fixtures/native-net-parity"

test("custom symbol pins use their exported names and explicit numbers", async () => {
  const { native } = await expectNativeParity(
    await render(
      <board width="20mm" height="10mm" routingDisabled>
        <chip
          name="U1"
          footprint="0603"
          symbol={
            <symbol>
              <schematicrect width={1} height={1} />
              <port
                name="IN"
                pinNumber={1}
                direction="left"
                schX={-1}
                schY={0}
              />
              <port
                name="OUT"
                pinNumber={2}
                direction="right"
                schX={1}
                schY={0}
              />
            </symbol>
          }
        />
      </board>,
    ),
  )
  expect(native).toContainEqual({
    name: "unconnected-(U1-IN-Pad1)",
    pins: ["U1.1"],
  })
  expect(native).toContainEqual({
    name: "unconnected-(U1-OUT-Pad2)",
    pins: ["U1.2"],
  })
}, 30_000)
