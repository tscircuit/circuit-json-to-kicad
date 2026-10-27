import { escapeKicadSexprString } from "./escapeKicadSexprString"

/**
 * Generate sym-lib-table content for KiCad symbol library.
 */
export function generateSymLibTable(params: {
  kicadLibraryName: string
  includeUser: boolean
  includeBuiltin: boolean
}): string {
  const { kicadLibraryName, includeUser, includeBuiltin } = params
  const escapedLibraryName = escapeKicadSexprString(kicadLibraryName)
  let content = "(sym_lib_table\n"
  if (includeUser) {
    content += `  (lib (name "${escapedLibraryName}")(type "KiCad")(uri "\${KIPRJMOD}/symbols/${escapedLibraryName}.kicad_sym")(options "")(descr ""))\n`
  }
  if (includeBuiltin) {
    content += `  (lib (name "tscircuit_builtin")(type "KiCad")(uri "\${KIPRJMOD}/symbols/tscircuit_builtin.kicad_sym")(options "")(descr ""))\n`
  }
  content += ")\n"
  return content
}
