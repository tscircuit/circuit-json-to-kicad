import { createHash } from "crypto"

/**
 * Generates a deterministic UUID from input data
 * This ensures tests are reproducible by generating the same UUID for the same input
 */
export function generateDeterministicUuid(data: string): string {
  // Create MD5 hash of the input data
  const hash = createHash("md5").update(data).digest("hex")

  // Format as UUID (8-4-4-4-12)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
}
