import { Circuit } from "tscircuit"

export async function createSchematicGridCircuit() {
  const circuit = new Circuit()
  circuit.add(
    <board routingDisabled>
      <inductor name="L1" inductance="10uH" schX={0.137} schY={0.219} />
      <resistor name="R1" resistance="1k" schX={4.373} schY={0.219} />
      <inductor name="L2" inductance="10uH" schX={0.193} schY={-3.457} />
      <resistor name="R2" resistance="1k" schX={4.429} schY={-3.457} />
      <resistor name="R3" resistance="2k" schX={4.373} schY={3.819} />
      <netlabel
        net="GRID_SIGNAL"
        connectsTo=".R3 > .pin1"
        schX={7.313}
        schY={3.819}
      />
      <trace from=".L1 > .pin2" to=".R3 > .pin1" />
      <trace from=".L1 > .pin2" to=".R1 > .pin1" />
      <trace from=".L2 > .pin2" to=".R2 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}
