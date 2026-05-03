import path from 'node:path'
import { glob } from 'glob'
import { DEFAULT_EXCLUDE, DEFAULT_INCLUDE } from './constants'
import { validateRemoteReferences } from './remote'
import { evaluateFile, finalizeFindings } from './rules'
import { Config, ScanOptions, ScanResult } from './types'

export async function scan(options: ScanOptions): Promise<ScanResult> {
  const files = await discoverFiles(options.root, options.include, options.exclude, options.config)
  const trackedFiles = new Set(files)
  const staticFindings = files.flatMap((file) =>
    evaluateFile(options.root, file, options.config, trackedFiles)
  )
  const remoteFindings =
    options.config.remoteValidation === true
      ? finalizeFindings(
          await validateRemoteReferences(options.root, files, options.config),
          options.config,
          trackedFiles
        )
      : []

  return {
    findings: [...staticFindings, ...remoteFindings],
    scannedFiles: files
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

  return Array.from(new Set(files.map((file) => normalizePath(file)))).sort()
}

export function resolveScanRoot(workspace: string, requestedPath: string): string {
  return path.resolve(workspace, requestedPath || '.')
}

function normalizePath(file: string): string {
  return file.split(path.sep).join('/')
}
