/**
 * Generate fp-lib-table content for KiCad footprint library.
 */
export function generateFpLibTable(params: {
  kicadLibraryName: string
  includeBuiltin: boolean
}): string {
  const { kicadLibraryName, includeBuiltin } = params
  let content = "(fp_lib_table\n"
  content += `  (lib (name "${kicadLibraryName}")(type "KiCad")(uri "\${KIPRJMOD}/footprints/${kicadLibraryName}.pretty")(options "")(descr ""))\n`
  if (includeBuiltin) {
    content += `  (lib (name "tscircuit_builtin")(type "KiCad")(uri "\${KIPRJMOD}/footprints/tscircuit_builtin.pretty")(options "")(descr ""))\n`
  }
  content += ")\n"
  return content
}
