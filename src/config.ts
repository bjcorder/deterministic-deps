import fs from 'node:fs'
import path from 'node:path'
import yaml from 'osl-js-yaml'
import {
  Config,
  ConfigDiagnostic,
  ConfigLoadResult,
  EcosystemOptions,
  Mode,
  RemoteTokenPolicy,
  Severity
} from './types'

export const VALID_SEVERITIES = ['low', 'medium', 'high'] as const
export const VALID_MODES = ['advisory', 'enforce'] as const
export const VALID_REMOTE_TOKEN_POLICIES = ['auto', 'never'] as const
export const ECOSYSTEM_OPTIONS: Record<string, string[]> = {
  go: ['requireGoSum'],
  jvm: ['allowDynamicVersionsWithGradleMetadata'],
  node: ['requireLockfile', 'allowVersionRangesWithLockfile'],
  python: ['requireProjectLockfile', 'requireRequirementHashes'],
  ruby: ['requireLockfile'],
  rust: ['requireLockfile'],
  terraform: ['requireProviderLock']
}

// Defense-in-depth caps. The workflow author controls these inputs in practice,
// but bounding them keeps a misconfigured value from hanging the runner or
// exhausting memory during YAML parsing.
export const MAX_CONFIG_FILE_BYTES = 1_048_576
export const MAX_REMOTE_TIMEOUT_MS = 60_000
export const MAX_REMOTE_RETRIES = 10

export function splitPatterns(value?: string): string[] {
  if (!value) {
    return []
  }

  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function normalizeModeInput(
  value: string | undefined,
  fallback: Mode = 'advisory',
  key = 'mode'
): { value: Mode; diagnostics: ConfigDiagnostic[] } {
  if (value === undefined || value === '') {
    return { value: fallback, diagnostics: [] }
  }

  if (value === 'advisory' || value === 'enforce') {
    return { value, diagnostics: [] }
  }

  return {
    value: fallback,
    diagnostics: [
      {
        message: `Invalid action input ${key} '${String(value)}'; expected one of ${VALID_MODES.join(', ')}. Falling back to ${fallback}.`
      }
    ]
  }
}

export function normalizeSeverityInput(
  value: string | undefined,
  fallback: Severity = 'low',
  key = 'severity-threshold'
): { value: Severity; diagnostics: ConfigDiagnostic[] } {
  if (value === undefined || value === '') {
    return { value: fallback, diagnostics: [] }
  }

  if (isSeverity(value)) {
    return { value, diagnostics: [] }
  }

  return {
    value: fallback,
    diagnostics: [
      {
        message: `Invalid action input ${key} '${String(value)}'; expected one of ${VALID_SEVERITIES.join(', ')}. Falling back to ${fallback}.`
      }
    ]
  }
}

export function normalizeBooleanInput(
  value: string | undefined,
  key: string,
  fallback: boolean
): { value: boolean; diagnostics: ConfigDiagnostic[] } {
  if (value === undefined || value === '') {
    return { value: fallback, diagnostics: [] }
  }

  const normalized = value.toLowerCase()
  if (normalized === 'true') {
    return { value: true, diagnostics: [] }
  }
  if (normalized === 'false') {
    return { value: false, diagnostics: [] }
  }

  return {
    value: fallback,
    diagnostics: [
      {
        message: `Invalid action input ${key}; expected boolean true or false. Falling back to ${String(fallback)}.`
      }
    ]
  }
}

export function normalizePositiveIntegerInput(
  value: string | undefined,
  key: string,
  fallback: number,
  max?: number
): { value: number; diagnostics: ConfigDiagnostic[] } {
  if (value === undefined || value === '') {
    return { value: fallback, diagnostics: [] }
  }

  if (!/^\d+$/.test(value)) {
    return {
      value: fallback,
      diagnostics: [
        {
          message: `Invalid action input ${key}; expected a non-negative integer. Falling back to ${fallback}.`
        }
      ]
    }
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 0) {
    return {
      value: fallback,
      diagnostics: [
        {
          message: `Invalid action input ${key}; expected a non-negative integer. Falling back to ${fallback}.`
        }
      ]
    }
  }

  if (max !== undefined && parsed > max) {
    return {
      value: max,
      diagnostics: [
        {
          message: `Action input ${key} (${parsed}) exceeds maximum ${max}; clamping to ${max}.`
        }
      ]
    }
  }

  return { value: parsed, diagnostics: [] }
}

export function normalizeRemoteTokenPolicyInput(
  value: string | undefined,
  fallback: RemoteTokenPolicy = 'auto',
  key = 'remote-token-policy'
): { value: RemoteTokenPolicy; diagnostics: ConfigDiagnostic[] } {
  if (value === undefined || value === '') {
    return { value: fallback, diagnostics: [] }
  }

  if (isRemoteTokenPolicy(value)) {
    return { value, diagnostics: [] }
  }

  return {
    value: fallback,
    diagnostics: [
      {
        message: `Invalid action input ${key} '${String(value)}'; expected one of ${VALID_REMOTE_TOKEN_POLICIES.join(', ')}. Falling back to ${fallback}.`
      }
    ]
  }
}

export function loadConfig(root: string, configPath: string): Config {
  return loadConfigWithDiagnostics(root, configPath).config
}

export function loadConfigWithDiagnostics(root: string, configPath: string): ConfigLoadResult {
  const resolved = path.resolve(root, configPath)

  // Defense-in-depth: refuse a config path that escapes the scan root.
  const relative = path.relative(root, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return {
      config: {},
      diagnostics: [
        {
          message: `Refusing to load config '${configPath}' because it resolves outside the scan root.`
        }
      ]
    }
  }

  if (!fs.existsSync(resolved)) {
    return { config: {}, diagnostics: [] }
  }

  const containment = validateConfigContainment(root, resolved, configPath)
  if (!containment.valid) {
    return { config: {}, diagnostics: containment.diagnostics }
  }

  let stat: fs.Stats
  try {
    stat = fs.statSync(containment.realPath)
  } catch (error) {
    return {
      config: {},
      diagnostics: [
        {
          message: `Unable to stat config '${configPath}': ${error instanceof Error ? error.message : String(error)}.`
        }
      ]
    }
  }
  if (!stat.isFile()) {
    return {
      config: {},
      diagnostics: [
        {
          message: `Refusing to load config '${configPath}' because it is not a regular file.`
        }
      ]
    }
  }
  if (stat.size > MAX_CONFIG_FILE_BYTES) {
    return {
      config: {},
      diagnostics: [
        {
          message: `Refusing to load config '${configPath}' (${stat.size} bytes) because it exceeds the ${MAX_CONFIG_FILE_BYTES}-byte limit.`
        }
      ]
    }
  }

  const rawContent = fs.readFileSync(containment.realPath, 'utf8')
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
      patch: readBoolean(raw, 'patch', diagnostics),
      remoteValidation: readBoolean(raw, 'remote-validation', diagnostics),
      remoteTokenPolicy: readRemoteTokenPolicy(raw, diagnostics),
      remoteValidationTimeoutMs: readPositiveInteger(
        raw,
        'remote-timeout-ms',
        diagnostics,
        MAX_REMOTE_TIMEOUT_MS
      ),
      remoteValidationRetries: readPositiveInteger(
        raw,
        'remote-retries',
        diagnostics,
        MAX_REMOTE_RETRIES
      ),
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

function validateConfigContainment(
  root: string,
  resolvedConfigPath: string,
  configPath: string
):
  | { valid: true; realPath: string; diagnostics: [] }
  | { valid: false; diagnostics: ConfigDiagnostic[] } {
  let realRoot: string
  let realConfigPath: string
  try {
    realRoot = fs.realpathSync(root)
    realConfigPath = fs.realpathSync(resolvedConfigPath)
  } catch (error) {
    return {
      valid: false,
      diagnostics: [
        {
          message: `Unable to resolve config '${configPath}': ${error instanceof Error ? error.message : String(error)}.`
        }
      ]
    }
  }

  const relative = path.relative(realRoot, realConfigPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return {
      valid: false,
      diagnostics: [
        {
          message: `Refusing to load config '${configPath}' because it resolves outside the scan root.`
        }
      ]
    }
  }

  return { valid: true, realPath: realConfigPath, diagnostics: [] }
}

function parseYamlConfig(content: string, configPath: string): unknown {
  try {
    // js-yaml v4's default schema is safe and preserves YAML merge-key behavior
    // that existing policy configs may rely on.
    return yaml.load(content, { schema: yaml.DEFAULT_SCHEMA })
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

function readRemoteTokenPolicy(
  raw: Record<string, unknown>,
  diagnostics: ConfigDiagnostic[]
): RemoteTokenPolicy | undefined {
  const value = raw['remote-token-policy']
  if (value === undefined) {
    return undefined
  }

  if (isRemoteTokenPolicy(value)) {
    return value
  }

  diagnostics.push({
    message: `Invalid remote-token-policy '${String(value)}'; expected one of ${VALID_REMOTE_TOKEN_POLICIES.join(', ')}.`
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

function readBoolean(
  raw: Record<string, unknown>,
  key: string,
  diagnostics: ConfigDiagnostic[]
): boolean | undefined {
  const value = raw[key]
  if (value === undefined) {
    return undefined
  }

  if (typeof value === 'boolean') {
    return value
  }

  diagnostics.push({
    message: `Invalid ${key}; expected boolean true or false.`
  })
  return undefined
}

function readPositiveInteger(
  raw: Record<string, unknown>,
  key: string,
  diagnostics: ConfigDiagnostic[],
  max?: number
): number | undefined {
  const value = raw[key]
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    diagnostics.push({
      message: `Invalid ${key}; expected a non-negative integer.`
    })
    return undefined
  }

  if (max !== undefined && value > max) {
    diagnostics.push({
      message: `${key} (${value}) exceeds maximum ${max}; clamping to ${max}.`
    })
    return max
  }

  return value
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
  return typeof value === 'string' && (VALID_SEVERITIES as readonly string[]).includes(value)
}

function isRemoteTokenPolicy(value: unknown): value is RemoteTokenPolicy {
  return (
    typeof value === 'string' && (VALID_REMOTE_TOKEN_POLICIES as readonly string[]).includes(value)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
