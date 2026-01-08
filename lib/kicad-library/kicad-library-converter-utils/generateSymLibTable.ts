/**
 * Generate sym-lib-table content.
 */
export function generateSymLibTable(params: {
  libraryName: string
  includeBuiltin: boolean
}): string {
  const { libraryName, includeBuiltin } = params
  let content = "(sym_lib_table\n"
  content += `  (lib (name "${libraryName}")(type "KiCad")(uri "\${KIPRJMOD}/symbols/${libraryName}.kicad_sym")(options "")(descr ""))\n`
  if (includeBuiltin) {
    content += `  (lib (name "tscircuit_builtin")(type "KiCad")(uri "\${KIPRJMOD}/symbols/tscircuit_builtin.kicad_sym")(options "")(descr ""))\n`
  }
  content += ")\n"
  return content
}
