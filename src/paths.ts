import fs from 'node:fs'
import path from 'node:path'

function containsUnsafePathControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

export function isSafeWorkspaceRelativePath(file: string): boolean {
  if (containsUnsafePathControlCharacter(file) || file.length === 0) {
    return false
  }

  if (path.isAbsolute(file) || path.win32.isAbsolute(file)) {
    return false
  }

  return !file
    .replaceAll('\\', '/')
    .split('/')
    .some((segment) => segment === '..')
}

export function normalizeWorkspaceRelativePath(root: string, file: string): string | undefined {
  const normalized = normalizeLexicalWorkspaceRelativePath(root, file)
  if (!normalized) {
    return undefined
  }

  return realpathStaysInsideRoot(root, normalized) ? normalized : undefined
}

export function normalizeLexicalWorkspaceRelativePath(
  root: string,
  file: string
): string | undefined {
  if (containsUnsafePathControlCharacter(file) || file.length === 0) {
    return undefined
  }

  if (path.isAbsolute(file) || path.win32.isAbsolute(file)) {
    return undefined
  }

  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, file)
  const relative = path.relative(resolvedRoot, resolved)
  if (!isContainedRelativePath(relative)) {
    return undefined
  }

  return relative.split(path.sep).join('/')
}

export function realpathStaysInsideRoot(root: string, file: string): boolean {
  try {
    const realRoot = fs.realpathSync(root)
    const realTarget = fs.realpathSync(path.join(root, file))
    const relative = path.relative(realRoot, realTarget)
    return relative.length === 0 || isContainedRelativePath(relative)
  } catch {
    return false
  }
}

export function existingAncestorRealpathStaysInsideRoot(root: string, target: string): boolean {
  let current = target
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) {
      return false
    }
    current = parent
  }

  try {
    const realRoot = fs.realpathSync(root)
    const realAncestor = fs.realpathSync(current)
    const relative = path.relative(realRoot, realAncestor)
    return relative.length === 0 || isContainedRelativePath(relative)
  } catch {
    return false
  }
}

function isContainedRelativePath(relative: string): boolean {
  return (
    relative.length > 0 &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}
