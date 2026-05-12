import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import yaml from 'js-yaml'
import {
  ECOSYSTEM_OPTIONS,
  VALID_MODES,
  VALID_REMOTE_TOKEN_POLICIES,
  VALID_SEVERITIES,
  loadConfig,
  loadConfigWithDiagnostics,
  normalizeBooleanInput,
  normalizeModeInput,
  normalizePositiveIntegerInput,
  normalizeRemoteTokenPolicyInput,
  normalizeSeverityInput
} from '../src/config'

const schemaPath = path.join(__dirname, '..', 'docs', 'deterministic-deps.schema.json')
const configurationDocsPath = path.join(__dirname, '..', 'docs', 'configuration.md')

function tempRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'deterministic-deps-config-'))
}

function configSchema(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as Record<string, unknown>
}

function validateAgainstSchema(value: unknown): { valid: boolean; errors: string[] } {
  const ajv = new Ajv2020({ allErrors: true })
  const validate = ajv.compile(configSchema())
  const valid = validate(value)

  return {
    valid,
    errors: (validate.errors ?? []).map((error) => `${error.instancePath} ${error.message}`)
  }
}

function configurationDocsExample(): unknown {
  const docs = fs.readFileSync(configurationDocsPath, 'utf8')
  const match = docs.match(/```yaml\n([\s\S]*?)\n```/)
  if (!match) {
    throw new Error('Unable to find YAML configuration example in docs/configuration.md')
  }

  return yaml.load(match[1])
}

describe('configuration', () => {
  it('loads ecosystem policy options from YAML', () => {
    const root = tempRepo()
    fs.writeFileSync(
      path.join(root, '.deterministic-deps.yml'),
      [
        'ecosystems:',
        '  node:',
        '    requireLockfile: false',
        '    allowVersionRangesWithLockfile: true',
        '  jvm:',
        '    allowDynamicVersionsWithGradleMetadata: false',
        '  python:',
        '    requireRequirementHashes: false',
        ''
      ].join('\n'),
      'utf8'
    )

    const config = loadConfig(root, '.deterministic-deps.yml')

    expect(config.ecosystems?.node?.requireLockfile).toBe(false)
    expect(config.ecosystems?.node?.allowVersionRangesWithLockfile).toBe(true)
    expect(config.ecosystems?.jvm?.allowDynamicVersionsWithGradleMetadata).toBe(false)
    expect(config.ecosystems?.python?.requireRequirementHashes).toBe(false)
  })

  it('reports invalid config fields and keeps valid values', () => {
    const root = tempRepo()
    fs.writeFileSync(
      path.join(root, '.deterministic-deps.yml'),
      [
        'mode: sometimes',
        'severity-threshold: urgent',
        'patch: maybe',
        'remote-validation: maybe',
        'remote-token-policy: sometimes',
        'remote-timeout-ms: slow',
        'remote-retries: -1',
        'include: "**/*.tf"',
        'rules:',
        '  containers/image-digest: maybe',
        '  node/non-deterministic-spec: false',
        'severity:',
        '  python/hash-pinned-requirement: loud',
        '  terraform/provider-lock: medium',
        'allowlist:',
        '  - nope',
        'ecosystems:',
        '  node:',
        '    requireLockfile: no',
        '    allowVersionRangesWithLockfile: true',
        '    typo: true',
        '  jvm:',
        '    allowDynamicVersionsWithGradleMetadata: maybe',
        '  madeup:',
        '    requireLockfile: true',
        ''
      ].join('\n'),
      'utf8'
    )

    const result = loadConfigWithDiagnostics(root, '.deterministic-deps.yml')

    expect(result.config.mode).toBeUndefined()
    expect(result.config.severityThreshold).toBeUndefined()
    expect(result.config.patch).toBeUndefined()
    expect(result.config.remoteValidation).toBeUndefined()
    expect(result.config.remoteTokenPolicy).toBeUndefined()
    expect(result.config.remoteValidationTimeoutMs).toBeUndefined()
    expect(result.config.remoteValidationRetries).toBeUndefined()
    expect(result.config.include).toBeUndefined()
    expect(result.config.rules).toEqual({ 'node/non-deterministic-spec': false })
    expect(result.config.severityOverrides).toEqual({ 'terraform/provider-lock': 'medium' })
    expect(result.config.allowlist).toEqual([])
    expect(result.config.ecosystems?.node).toEqual({ allowVersionRangesWithLockfile: true })
    expect(result.config.ecosystems?.madeup).toBeUndefined()
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(
      expect.arrayContaining([
        "Invalid mode 'sometimes'; expected one of advisory, enforce.",
        "Invalid severity-threshold 'urgent'; expected one of low, medium, high.",
        'Invalid patch; expected boolean true or false.',
        'Invalid remote-validation; expected boolean true or false.',
        "Invalid remote-token-policy 'sometimes'; expected one of auto, never.",
        'Invalid remote-timeout-ms; expected a non-negative integer.',
        'Invalid remote-retries; expected a non-negative integer.',
        'Invalid include; expected an array of strings.',
        "Invalid rules value 'maybe'; expected boolean true or false.",
        "Invalid severity override 'loud'; expected one of low, medium, high.",
        'Invalid allowlist entry; expected a mapping.',
        'Invalid ecosystems.node.requireLockfile; expected boolean true or false.',
        'Unknown option ecosystems.node.typo; known options are requireLockfile, allowVersionRangesWithLockfile.',
        'Invalid ecosystems.jvm.allowDynamicVersionsWithGradleMetadata; expected boolean true or false.',
        "Unknown ecosystem 'madeup'; known ecosystems are go, jvm, node, python, ruby, rust, terraform."
      ])
    )
  })

  it('throws a clear error for malformed YAML', () => {
    const root = tempRepo()
    fs.writeFileSync(path.join(root, '.deterministic-deps.yml'), 'mode: [oops\n', 'utf8')

    expect(() => loadConfigWithDiagnostics(root, '.deterministic-deps.yml')).toThrow(
      /Unable to parse \.deterministic-deps\.yml/
    )
  })

  it('loads remote validation options from YAML', () => {
    const root = tempRepo()
    fs.writeFileSync(
      path.join(root, '.deterministic-deps.yml'),
      [
        'patch: true',
        'remote-validation: true',
        'remote-token-policy: never',
        'remote-timeout-ms: 2500',
        'remote-retries: 2',
        ''
      ].join('\n'),
      'utf8'
    )

    const config = loadConfig(root, '.deterministic-deps.yml')

    expect(config.patch).toBe(true)
    expect(config.remoteValidation).toBe(true)
    expect(config.remoteTokenPolicy).toBe('never')
    expect(config.remoteValidationTimeoutMs).toBe(2500)
    expect(config.remoteValidationRetries).toBe(2)
  })

  it('warns on invalid action inputs and falls back deterministically', () => {
    const diagnostics = [
      ...normalizeModeInput('sometimes', 'enforce').diagnostics,
      ...normalizeSeverityInput('urgent', 'medium').diagnostics,
      ...normalizeBooleanInput('maybe', 'sarif', true).diagnostics,
      ...normalizeBooleanInput('maybe', 'patch', false).diagnostics,
      ...normalizeBooleanInput('maybe', 'remote-validation', true).diagnostics,
      ...normalizeRemoteTokenPolicyInput('sometimes', 'never').diagnostics,
      ...normalizePositiveIntegerInput('slow', 'remote-timeout-ms', 5000).diagnostics,
      ...normalizePositiveIntegerInput('1.5', 'remote-retries', 1).diagnostics
    ]

    expect(normalizeModeInput('sometimes', 'enforce').value).toBe('enforce')
    expect(normalizeSeverityInput('urgent', 'medium').value).toBe('medium')
    expect(normalizeBooleanInput('maybe', 'sarif', true).value).toBe(true)
    expect(normalizeBooleanInput('maybe', 'patch', false).value).toBe(false)
    expect(normalizeBooleanInput('maybe', 'remote-validation', true).value).toBe(true)
    expect(normalizeRemoteTokenPolicyInput('sometimes', 'never').value).toBe('never')
    expect(normalizePositiveIntegerInput('slow', 'remote-timeout-ms', 5000).value).toBe(5000)
    expect(normalizePositiveIntegerInput('1.5', 'remote-retries', 1).value).toBe(1)
    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "Invalid action input mode 'sometimes'; expected one of advisory, enforce. Falling back to enforce.",
      "Invalid action input severity-threshold 'urgent'; expected one of low, medium, high. Falling back to medium.",
      'Invalid action input sarif; expected boolean true or false. Falling back to true.',
      'Invalid action input patch; expected boolean true or false. Falling back to false.',
      'Invalid action input remote-validation; expected boolean true or false. Falling back to true.',
      "Invalid action input remote-token-policy 'sometimes'; expected one of auto, never. Falling back to never.",
      'Invalid action input remote-timeout-ms; expected a non-negative integer. Falling back to 5000.',
      'Invalid action input remote-retries; expected a non-negative integer. Falling back to 1.'
    ])
  })

  it('uses valid action inputs and preserves config fallbacks when omitted', () => {
    expect(normalizeModeInput('', 'enforce')).toEqual({ value: 'enforce', diagnostics: [] })
    expect(normalizeSeverityInput(undefined, 'high')).toEqual({
      value: 'high',
      diagnostics: []
    })
    expect(normalizeBooleanInput('', 'patch', true)).toEqual({ value: true, diagnostics: [] })
    expect(normalizePositiveIntegerInput(undefined, 'remote-retries', 3)).toEqual({
      value: 3,
      diagnostics: []
    })
    expect(normalizeRemoteTokenPolicyInput('', 'never')).toEqual({
      value: 'never',
      diagnostics: []
    })

    expect(normalizeModeInput('advisory', 'enforce')).toEqual({
      value: 'advisory',
      diagnostics: []
    })
    expect(normalizeSeverityInput('low', 'high')).toEqual({ value: 'low', diagnostics: [] })
    expect(normalizeBooleanInput('FALSE', 'remote-validation', true)).toEqual({
      value: false,
      diagnostics: []
    })
    expect(normalizePositiveIntegerInput('0', 'remote-retries', 3)).toEqual({
      value: 0,
      diagnostics: []
    })
    expect(normalizeRemoteTokenPolicyInput('auto', 'never')).toEqual({
      value: 'auto',
      diagnostics: []
    })
  })

  it('publishes a schema that accepts the documented configuration example', () => {
    expect(validateAgainstSchema(configurationDocsExample())).toEqual({ valid: true, errors: [] })
  })

  it('publishes a schema that rejects common invalid configuration values', () => {
    const invalidConfig = {
      mode: 'sometimes',
      'severity-threshold': 'urgent',
      patch: 'maybe',
      'remote-validation': 'yes',
      'remote-token-policy': 'sometimes',
      'remote-timeout-ms': 'slow',
      'remote-retries': -1,
      include: '**/*.tf',
      rules: {
        'containers/image-digest': 'maybe'
      },
      severity: {
        'node/non-deterministic-spec': 'loud'
      },
      allowlist: ['nope'],
      ecosystems: {
        node: {
          requireLockfile: 'no',
          typo: true
        },
        madeup: {
          requireLockfile: true
        }
      },
      unexpected: true
    }

    const result = validateAgainstSchema(invalidConfig)

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        '/mode must be equal to one of the allowed values',
        '/severity-threshold must be equal to one of the allowed values',
        '/patch must be boolean',
        '/remote-validation must be boolean',
        '/remote-token-policy must be equal to one of the allowed values',
        '/remote-timeout-ms must be integer',
        '/remote-retries must be >= 0',
        '/include must be array',
        '/rules/containers~1image-digest must be boolean',
        '/severity/node~1non-deterministic-spec must be equal to one of the allowed values',
        '/allowlist/0 must be object',
        '/ecosystems/node/requireLockfile must be boolean',
        '/ecosystems/node must NOT have additional properties',
        '/ecosystems must NOT have additional properties',
        ' must NOT have additional properties'
      ])
    )
  })

  it('keeps schema enums and ecosystem options aligned with parser constants', () => {
    const schema = configSchema()
    const properties = schema.properties as Record<string, Record<string, unknown>>
    const definitions = schema.$defs as Record<string, Record<string, unknown>>
    const ecosystemProperties = properties.ecosystems.properties as Record<string, { $ref: string }>

    expect(properties.mode.enum).toEqual(VALID_MODES)
    expect(properties['remote-token-policy'].enum).toEqual(VALID_REMOTE_TOKEN_POLICIES)
    expect(definitions.severity.enum).toEqual(VALID_SEVERITIES)
    expect(Object.keys(ecosystemProperties).sort()).toEqual(Object.keys(ECOSYSTEM_OPTIONS).sort())

    for (const [ecosystem, options] of Object.entries(ECOSYSTEM_OPTIONS)) {
      const reference = ecosystemProperties[ecosystem].$ref.replace('#/$defs/', '')
      const optionSchema = definitions[reference]
      expect(Object.keys(optionSchema.properties as Record<string, unknown>).sort()).toEqual(
        [...options].sort()
      )
    }
  })
})
