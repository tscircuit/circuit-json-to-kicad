import { $ } from "bun"

type FilePath = string
type FileContent = Buffer

export interface KicadOutput {
  exitCode: number
  generatedFileContent: Record<FilePath, FileContent>
}

/**
 * Executes kicad-cli commands e.g.
 * - kicad-cli sch export svg ./flat_hierarchy.kicad_sch -o out/svg --theme "Modern" --no-background-color
 *
 * ...and returns the outputs
 */
export const takeKicadSnapshot = async (params: {
  kicadFilePath?: string
  kicadFileContent?: string
  kicadFileType: "sch" | "pcb"
}): Promise<KicadOutput> => {
  // Check to make sure kicad-cli is installed
  const kicadCliVersion = await $`kicad-cli --version`

  if (!kicadCliVersion.stdout.toString().trim().startsWith("9.")) {
    throw new Error("kicad-cli version 9.0.0 or higher is required")
  }
}
