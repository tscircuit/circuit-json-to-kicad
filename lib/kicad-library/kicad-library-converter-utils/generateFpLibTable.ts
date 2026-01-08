/**
 * Generate fp-lib-table content.
 */
export function generateFpLibTable(
  libraryName: string,
  includeBuiltin: boolean,
): string {
  let content = "(fp_lib_table\n"
  content += `  (lib (name "${libraryName}")(type "KiCad")(uri "\${KIPRJMOD}/footprints/${libraryName}.pretty")(options "")(descr ""))\n`
  if (includeBuiltin) {
    content += `  (lib (name "tscircuit_builtin")(type "KiCad")(uri "\${KIPRJMOD}/footprints/tscircuit_builtin.pretty")(options "")(descr ""))\n`
  }
  content += ")\n"
  return content
}
