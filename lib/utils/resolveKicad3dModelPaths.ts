/** Allocate deterministic output paths without merging distinct model sources. */
export function resolveKicad3dModelPaths(
  sources: string[],
  projectName?: string,
): Map<string, string> {
  const groups = new Map<string, string[]>()
  for (const source of new Set(sources)) {
    const path = (source.split(/[?#]/)[0] || source).replaceAll("\\", "/")
    const filename = path.split("/").pop() || source
    const builtin =
      source.startsWith("http://modelcdn.tscircuit.com") ||
      source.startsWith("https://modelcdn.tscircuit.com")
    const folder = builtin
      ? "tscircuit_builtin"
      : (projectName ?? filename.replace(/\.[^.]+$/, ""))
    const outputPath = `3dmodels/${folder}.3dshapes/${filename}`
    const group = groups.get(outputPath) ?? []
    group.push(source)
    groups.set(outputPath, group)
  }
  const reserved = new Set(groups.keys())
  const paths = new Map<string, string>()
  for (const [path, group] of [...groups].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    if (group.length === 1) {
      paths.set(group[0]!, path)
      continue
    }
    const dot = path.lastIndexOf(".")
    const hasExtension = dot > path.lastIndexOf("/")
    const stem = hasExtension ? path.slice(0, dot) : path
    const extension = hasExtension ? path.slice(dot) : ""
    let index = 1
    for (const source of group.sort()) {
      let candidate: string
      do {
        candidate = `${stem}-${index++}${extension}`
      } while (reserved.has(candidate))
      reserved.add(candidate)
      paths.set(source, candidate)
    }
  }
  return paths
}
