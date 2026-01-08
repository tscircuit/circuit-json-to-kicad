/**
 * Generate fp-lib-table content.
 */
export function generateFpLibTable(params: {
  libraryName: string
  includeBuiltin: boolean
}): string {
  const { libraryName, includeBuiltin } = params
  let content = "(fp_lib_table\n"
  content += `  (lib (name "${libraryName}")(type "KiCad")(uri "\${KIPRJMOD}/footprints/${libraryName}.pretty")(options "")(descr ""))\n`
  if (includeBuiltin) {
    content += `  (lib (name "tscircuit_builtin")(type "KiCad")(uri "\${KIPRJMOD}/footprints/tscircuit_builtin.pretty")(options "")(descr ""))\n`
  }
  content += ")\n"
  return content
}
