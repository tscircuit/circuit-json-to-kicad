// SJ1 picks a pump supply on a soil pump controller: pad 1 = V5 (USB),
// pad 2 = PUMP_V, pad 3 = VEXT. The footprint is pre-bridged 1-2.
export const BridgedSolderJumperBoard = () => (
  <board width="16mm" height="10mm" routingDisabled schematicDisabled>
    <solderjumper
      name="SJ1"
      footprint="solderjumper3_bridged12"
      bridgedPins={[["1", "2"]]}
      pcbX={-2.54}
    />
    <trace from=".SJ1 > .pin1" to="net.V5" />
    <trace from=".SJ1 > .pin2" to="net.PUMP_V" />
    <trace from=".SJ1 > .pin3" to="net.VEXT" />
  </board>
)
