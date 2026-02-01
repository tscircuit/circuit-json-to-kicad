declare module "@tscircuit/cli/lib" {
  export interface ConvertToKicadLibraryOptions {
    filePath: string
    libraryName: string
    outputDir: string
    isPcm?: boolean
    kicadPcmPackageId?: string
    circuitJsonToKicadModule?: unknown
  }

  export interface GeneratePcmAssetsOptions {
    packageName: string
    version: string
    author: string
    description: string
    kicadLibraryPath: string
    outputDir: string
    baseUrl: string
  }

  export function convertToKicadLibrary(
    options: ConvertToKicadLibraryOptions,
  ): Promise<void>

  export function generatePcmAssets(
    options: GeneratePcmAssetsOptions,
  ): Promise<void>
}
