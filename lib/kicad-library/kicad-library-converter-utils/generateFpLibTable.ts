import { escapeKicadString } from "../../utils/escapeKicadString"

/**
 * Generate fp-lib-table content for KiCad footprint library.
 */
export function generateFpLibTable(params: {
  kicadLibraryName: string
  includeUser: boolean
  includeBuiltin: boolean
}): string {
  const { includeUser, includeBuiltin } = params
  const kicadLibraryName = escapeKicadString(params.kicadLibraryName)
  let content = "(fp_lib_table\n"
  if (includeUser) {
    content += `  (lib (name "${kicadLibraryName}")(type "KiCad")(uri "\${KIPRJMOD}/footprints/${kicadLibraryName}.pretty")(options "")(descr ""))\n`
  }
  if (includeBuiltin) {
    content += `  (lib (name "tscircuit_builtin")(type "KiCad")(uri "\${KIPRJMOD}/footprints/tscircuit_builtin.pretty")(options "")(descr ""))\n`
  }
  content += ")\n"
  return content
}
