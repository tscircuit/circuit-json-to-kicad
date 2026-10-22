import { test } from "bun:test"
import { render, expectNativeParity } from "../../fixtures/native-net-parity"

test("power and global labels keep their existing names", async () => {
  await expectNativeParity(
    await render(
      <board width="20mm" height="10mm" routingDisabled>
        <net name="VDD" isPowerNet />
        <net name="GND" isGroundNet />
        <capacitor
          name="C1"
          capacitance="100nF"
          footprint="0603"
          schX={-3}
          connections={{ pin1: "net.VDD", pin2: "net.GND" }}
        />
        <capacitor
          name="C2"
          capacitance="100nF"
          footprint="0603"
          schX={3}
          connections={{ pin1: "net.VDD", pin2: "net.GND" }}
        />
      </board>,
    ),
  )
}, 30_000)
