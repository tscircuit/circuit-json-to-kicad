/**
 * Simple hash function that converts a string to a hex hash
 * Used for generating deterministic UUIDs from input data
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }

  // Generate more bits by hashing multiple times with different seeds
  let result = ""
  for (let i = 0; i < 4; i++) {
    let h = hash
    for (let j = 0; j < str.length; j++) {
      h = (h << 5) - h + str.charCodeAt(j) + i * 31
      h = h & h
    }
    result += Math.abs(h).toString(16).padStart(8, "0")
  }

  return result
}

/**
 * Generates a deterministic UUID from input data
 * This ensures tests are reproducible by generating the same UUID for the same input
 */
export function generateDeterministicUuid(data: string): string {
  // Create hash of the input data
  const hash = simpleHash(data)

  // Format as UUID (8-4-4-4-12)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
}
