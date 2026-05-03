import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import {
  Config,
  ConfigDiagnostic,
  ConfigLoadResult,
  EcosystemOptions,
  Mode,
  Severity
} from './types'

const VALID_SEVERITIES = ['low', 'medium', 'high'] as const
const VALID_MODES = ['advisory', 'enforce'] as const
const ECOSYSTEM_OPTIONS: Record<string, string[]> = {
  go: ['requireGoSum'],
  jvm: ['allowDynamicVersionsWithGradleMetadata'],
  node: ['requireLockfile', 'allowVersionRangesWithLockfile'],
  python: ['requireProjectLockfile', 'requireRequirementHashes'],
  ruby: ['requireLockfile'],
  rust: ['requireLockfile'],
  terraform: ['requireProviderLock']
}

export function splitPatterns(value?: string): string[] {
  if (!value) {
    return []
  }

  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function normalizeMode(value: string | undefined, fallback: Mode = 'advisory'): Mode {
  if (value === 'advisory' || value === 'enforce') {
    return value
  }

  return fallback
}

export function normalizeSeverity(value: string | undefined, fallback: Severity = 'low'): Severity {
  if (value === 'low' || value === 'medium' || value === 'high') {
    return value
  }

  return fallback
}

export function loadConfig(root: string, configPath: string): Config {
  return loadConfigWithDiagnostics(root, configPath).config
}

export function loadConfigWithDiagnostics(root: string, configPath: string): ConfigLoadResult {
  const resolved = path.resolve(root, configPath)
  if (!fs.existsSync(resolved)) {
    return { config: {}, diagnostics: [] }
  }

  const rawContent = fs.readFileSync(resolved, 'utf8')
  const parsed = parseYamlConfig(rawContent, configPath)
  const diagnostics: ConfigDiagnostic[] = []

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    diagnostics.push({
      message: `${configPath} must contain a YAML mapping at the top level; ignoring config.`
    })
    return { config: {}, diagnostics }
  }

  const raw = parsed as Record<string, unknown>
  return {
    config: {
      mode: readMode(raw, diagnostics),
      severityThreshold: readSeverity(raw, 'severity-threshold', diagnostics),
      include: readStringArray(raw, 'include', diagnostics),
      exclude: readStringArray(raw, 'exclude', diagnostics),
      rules: readBooleanRecord(raw, 'rules', diagnostics),
      severityOverrides: readSeverityRecord(raw, diagnostics),
      allowlist: readAllowlist(raw, diagnostics),
      ecosystems: readEcosystems(raw, diagnostics)
    },
    diagnostics
  }
}

function parseYamlConfig(content: string, configPath: string): unknown {
  try {
    return yaml.load(content)
  } catch (error) {
    throw new Error(
      `Unable to parse ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
}

function readMode(raw: Record<string, unknown>, diagnostics: ConfigDiagnostic[]): Mode | undefined {
  const value = raw.mode
  if (value === undefined) {
    return undefined
  }

  if (value === 'advisory' || value === 'enforce') {
    return value
  }

  diagnostics.push({
    message: `Invalid mode '${String(value)}'; expected one of ${VALID_MODES.join(', ')}.`
  })
  return undefined
}

function readSeverity(
  raw: Record<string, unknown>,
  key: string,
  diagnostics: ConfigDiagnostic[]
): Severity | undefined {
  const value = raw[key]
  if (value === undefined) {
    return undefined
  }

  if (isSeverity(value)) {
    return value
  }

  diagnostics.push({
    message: `Invalid ${key} '${String(value)}'; expected one of ${VALID_SEVERITIES.join(', ')}.`
  })
  return undefined
}

function readStringArray(
  raw: Record<string, unknown>,
  key: string,
  diagnostics: ConfigDiagnostic[]
): string[] | undefined {
  const value = raw[key]
  if (value === undefined) {
    return undefined
  }

  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return value
  }

  diagnostics.push({
    message: `Invalid ${key}; expected an array of strings.`
  })
  return undefined
}

function readBooleanRecord(
  raw: Record<string, unknown>,
  key: string,
  diagnostics: ConfigDiagnostic[]
): Record<string, boolean> | undefined {
  const value = raw[key]
  if (value === undefined) {
    return undefined
  }

  if (!isRecord(value)) {
    diagnostics.push({
      message: `Invalid ${key}; expected a mapping of names to booleans.`
    })
    return undefined
  }

  const entries = Object.entries(value).filter(([, enabled]) => {
    const valid = typeof enabled === 'boolean'
    if (!valid) {
      diagnostics.push({
        message: `Invalid ${key} value '${String(enabled)}'; expected boolean true or false.`
      })
    }
    return valid
  })

  return Object.fromEntries(entries) as Record<string, boolean>
}

function readSeverityRecord(
  raw: Record<string, unknown>,
  diagnostics: ConfigDiagnostic[]
): Record<string, Severity> | undefined {
  const value = raw.severity
  if (value === undefined) {
    return undefined
  }

  if (!isRecord(value)) {
    diagnostics.push({
      message: 'Invalid severity; expected a mapping of rule ids to severity names.'
    })
    return undefined
  }

  const entries = Object.entries(value).filter(([, severity]) => {
    const valid = isSeverity(severity)
    if (!valid) {
      diagnostics.push({
        message: `Invalid severity override '${String(severity)}'; expected one of ${VALID_SEVERITIES.join(', ')}.`
      })
    }
    return valid
  }) as Array<[string, Severity]>

  return Object.fromEntries(entries)
}

function readAllowlist(
  raw: Record<string, unknown>,
  diagnostics: ConfigDiagnostic[]
): Config['allowlist'] {
  const value = raw.allowlist
  if (value === undefined) {
    return undefined
  }

  if (!Array.isArray(value)) {
    diagnostics.push({
      message: 'Invalid allowlist; expected an array of entries.'
    })
    return undefined
  }

  return value
    .filter((entry) => {
      const valid = isRecord(entry)
      if (!valid) {
        diagnostics.push({
          message: 'Invalid allowlist entry; expected a mapping.'
        })
      }
      return valid
    })
    .map((entry) => ({ ...entry }))
}

function readEcosystems(
  raw: Record<string, unknown>,
  diagnostics: ConfigDiagnostic[]
): EcosystemOptions | undefined {
  const value = raw.ecosystems
  if (value === undefined) {
    return undefined
  }

  if (!isRecord(value)) {
    diagnostics.push({
      message: 'Invalid ecosystems; expected a mapping of ecosystem names to options.'
    })
    return undefined
  }

  const ecosystems: EcosystemOptions = {}
  for (const [ecosystem, options] of Object.entries(value)) {
    if (!isRecord(options)) {
      diagnostics.push({
        message: `Invalid ecosystems.${ecosystem}; expected a mapping of option names to booleans.`
      })
      continue
    }

    const knownOptions = ECOSYSTEM_OPTIONS[ecosystem]
    if (!knownOptions) {
      diagnostics.push({
        message: `Unknown ecosystem '${ecosystem}'; known ecosystems are ${Object.keys(ECOSYSTEM_OPTIONS).join(', ')}.`
      })
      continue
    }

    const parsedOptions: Record<string, boolean> = {}
    for (const [option, optionValue] of Object.entries(options)) {
      if (!knownOptions.includes(option)) {
        diagnostics.push({
          message: `Unknown option ecosystems.${ecosystem}.${option}; known options are ${knownOptions.join(', ')}.`
        })
        continue
      }

      if (typeof optionValue !== 'boolean') {
        diagnostics.push({
          message: `Invalid ecosystems.${ecosystem}.${option}; expected boolean true or false.`
        })
        continue
      }

      parsedOptions[option] = optionValue
    }

    ecosystems[ecosystem] = parsedOptions
  }

  return ecosystems
}

function isSeverity(value: unknown): value is Severity {
  return value === 'low' || value === 'medium' || value === 'high'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
