import type { CircuitJson } from "circuit-json"
import { Fragment } from "react"
// Load the repo's JSX/core declarations before tscircuit-latest's nested core.
import "tscircuit"
import { Circuit } from "tscircuit-latest"

export interface CoalescedPair {
  firstRef: string
  firstPin: 1 | 2
  secondRef: string
  secondPin: 1 | 2
  x: number
}

export interface CoalescedScope {
  name: string
  pairs: CoalescedPair[]
  sheetName?: string
  explicitLabelAt?: { ref: string; pin: 1 | 2 }
}

/**
 * Generate coalesced, source-named wire islands from Circuit JSX. A scope is
 * one subcircuit connectivity namespace; equal net names in separate scopes
 * therefore have independent source identity while retaining real generated
 * component, trace, and schematic-port records.
 */
export async function createCoalescedNetCircuit(
  scopes: CoalescedScope[],
  netName = "SIGNAL",
): Promise<CircuitJson> {
  const circuit = new Circuit()
  const sheetNames = [
    ...new Set(scopes.flatMap((scope) => scope.sheetName ?? [])),
  ]

  circuit.add(
    <board
      width="80mm"
      height="40mm"
      routingDisabled
      schTraceAutoLabelEnabled
      schMaxTraceDistance={2}
    >
      {sheetNames.map((name, sheetIndex) => (
        <Fragment key={name}>
          <schematicsheet
            name={name}
            displayName={name}
            sheetIndex={sheetIndex}
          />
        </Fragment>
      ))}
      {scopes.map((scope) => (
        <Fragment key={scope.name}>
          <group subcircuit name={scope.name} schSheetName={scope.sheetName}>
            {scope.pairs.map((pair) => (
              <Fragment key={`${pair.firstRef}-${pair.secondRef}`}>
                <resistor
                  name={pair.firstRef}
                  resistance="1k"
                  footprint="0402"
                  schX={pair.x}
                />
                <resistor
                  name={pair.secondRef}
                  resistance="1k"
                  footprint="0402"
                  schX={pair.x + 5}
                />
                <trace
                  from={`.${pair.firstRef} > .pin${pair.firstPin}`}
                  to={`net.${netName}`}
                />
                <trace
                  from={`.${pair.secondRef} > .pin${pair.secondPin}`}
                  to={`net.${netName}`}
                />
                <trace
                  from={`.${pair.firstRef} > .pin${pair.firstPin}`}
                  to={`.${pair.secondRef} > .pin${pair.secondPin}`}
                />
                {scope.explicitLabelAt &&
                  scope.explicitLabelAt.ref === pair.firstRef && (
                    <netlabel
                      net={netName}
                      connectsTo={`.${scope.explicitLabelAt.ref} > .pin${scope.explicitLabelAt.pin}`}
                      schX={pair.x}
                      schY={4}
                      anchorSide="bottom"
                    />
                  )}
              </Fragment>
            ))}
          </group>
        </Fragment>
      ))}
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson() as CircuitJson
}
