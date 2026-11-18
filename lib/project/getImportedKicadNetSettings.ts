import type { CircuitJson } from "circuit-json"

/** Carry imported KiCad settings through this format boundary without interpreting them. */
export function getImportedKicadNetSettings(circuitJson: CircuitJson) {
  const importedSettings = circuitJson.flatMap((element) => {
    if (element.type !== "source_project_metadata") return []
    const settings = element.metadata?.kicad_project?.net_settings
    return settings === undefined ? [] : [settings]
  })
  if (importedSettings.length > 1) {
    throw new Error(
      "Cannot export net settings from multiple imported KiCad projects",
    )
  }
  return importedSettings[0] === undefined
    ? undefined
    : structuredClone(importedSettings[0])
}
