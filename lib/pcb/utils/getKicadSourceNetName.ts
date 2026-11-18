import type { SourceNet } from "circuit-json"

/** Restore the imported name only while the author has kept its Circuit JSON alias. */
export function getKicadSourceNetName(
  sourceNet: Pick<SourceNet, "name" | "metadata">,
) {
  const imported = sourceNet.metadata?.kicad_net
  return imported && sourceNet.name === imported.circuit_json_name
    ? imported.name
    : sourceNet.name
}
