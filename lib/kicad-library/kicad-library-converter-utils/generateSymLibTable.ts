/**
 * Generate sym-lib-table content for KiCad symbol library.
 */
export function generateSymLibTable(params: {
  kicadLibraryName: string
  includeUser: boolean
  includeBuiltin: boolean
}): string {
  const { kicadLibraryName, includeUser, includeBuiltin } = params
  let content = "(sym_lib_table\n"
  if (includeUser) {
    content += `  (lib (name "${kicadLibraryName}")(type "KiCad")(uri "\${KIPRJMOD}/symbols/${kicadLibraryName}.kicad_sym")(options "")(descr ""))\n`
  }
  if (includeBuiltin) {
    content += `  (lib (name "tscircuit_builtin")(type "KiCad")(uri "\${KIPRJMOD}/symbols/tscircuit_builtin.kicad_sym")(options "")(descr ""))\n`
  }
  content += ")\n"
  return content
}
