export function makeDuplicateFileName(name, existingNames) {
  const dot = name.lastIndexOf('.')
  const hasExtension = dot > 0
  const stem = hasExtension ? name.slice(0, dot) : name
  const extension = hasExtension ? name.slice(dot) : ''
  const used = new Set(existingNames.map(value => value.toLocaleLowerCase()))
  let suffix = 1
  let candidate
  do {
    candidate = `${stem} copy${suffix > 1 ? ` ${suffix}` : ''}${extension}`
    suffix += 1
  } while (used.has(candidate.toLocaleLowerCase()))
  return candidate
}
