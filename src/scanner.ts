import fs from 'node:fs'
import path from 'node:path'
import { glob } from 'osl-glob'
import { DEFAULT_EXCLUDE, DEFAULT_INCLUDE } from './constants'
import { existingAncestorRealpathStaysInsideRoot, normalizeWorkspaceRelativePath } from './paths'
import { validateRemoteReferences } from './remote'
import { evaluateFile, finalizeFindings } from './rules'
import { Config, ScanOptions, ScanResult } from './types'

export async function scan(options: ScanOptions): Promise<ScanResult> {
  const files = await discoverFiles(options.root, options.include, options.exclude, options.config)
  const trackedFiles = new Set(files)
  const staticFindings = files.flatMap((file) =>
    evaluateFile(options.root, file, options.config, trackedFiles)
  )
  const remoteResult =
    options.config.remoteValidation === true
      ? await validateRemoteReferences(options.root, files, options.config)
      : { findings: [], diagnostics: [] }
  const remoteFindings =
    options.config.remoteValidation === true
      ? finalizeFindings(remoteResult.findings, options.config, trackedFiles)
      : []

  return {
    findings: [...staticFindings, ...remoteFindings],
    scannedFiles: files,
    diagnostics: remoteResult.diagnostics
  }
}

export async function discoverFiles(
  root: string,
  include: string[] = DEFAULT_INCLUDE,
  exclude: string[] = DEFAULT_EXCLUDE,
  config: Config = {}
): Promise<string[]> {
  const patterns = include.length > 0 ? include : (config.include ?? DEFAULT_INCLUDE)
  const ignore = [...DEFAULT_EXCLUDE, ...exclude, ...(config.exclude ?? [])]
  const files = await glob(patterns, {
    cwd: root,
    dot: true,
    nodir: true,
    ignore,
    windowsPathsNoEscape: true
  })

  return Array.from(
    new Set(
      files
        .map((file) => normalizeWorkspaceRelativePath(root, file))
        .filter((file): file is string => Boolean(file))
    )
  ).sort()
}

export function resolveScanRoot(workspace: string, requestedPath: string): string {
  const resolvedWorkspace = path.resolve(workspace)
  const resolved = path.resolve(resolvedWorkspace, requestedPath || '.')
  const relative = path.relative(resolvedWorkspace, resolved)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Scan path must resolve inside GITHUB_WORKSPACE: ${requestedPath || '.'}`)
  }

  if (!existingAncestorRealpathStaysInsideRoot(resolvedWorkspace, resolved)) {
    throw new Error(`Scan path must resolve inside GITHUB_WORKSPACE: ${requestedPath || '.'}`)
  }

  fs.mkdirSync(resolved, { recursive: true })
  return fs.realpathSync(resolved)
}
