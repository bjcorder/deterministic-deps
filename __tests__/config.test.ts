import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  loadConfig,
  loadConfigWithDiagnostics,
  normalizeBooleanInput,
  normalizeModeInput,
  normalizePositiveIntegerInput,
  normalizeSeverityInput
} from '../src/config'

function tempRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'deterministic-deps-config-'))
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
        'remote-timeout-ms: 2500',
        'remote-retries: 2',
        ''
      ].join('\n'),
      'utf8'
    )

    const config = loadConfig(root, '.deterministic-deps.yml')

    expect(config.patch).toBe(true)
    expect(config.remoteValidation).toBe(true)
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
      ...normalizePositiveIntegerInput('slow', 'remote-timeout-ms', 5000).diagnostics,
      ...normalizePositiveIntegerInput('1.5', 'remote-retries', 1).diagnostics
    ]

    expect(normalizeModeInput('sometimes', 'enforce').value).toBe('enforce')
    expect(normalizeSeverityInput('urgent', 'medium').value).toBe('medium')
    expect(normalizeBooleanInput('maybe', 'sarif', true).value).toBe(true)
    expect(normalizeBooleanInput('maybe', 'patch', false).value).toBe(false)
    expect(normalizeBooleanInput('maybe', 'remote-validation', true).value).toBe(true)
    expect(normalizePositiveIntegerInput('slow', 'remote-timeout-ms', 5000).value).toBe(5000)
    expect(normalizePositiveIntegerInput('1.5', 'remote-retries', 1).value).toBe(1)
    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "Invalid action input mode 'sometimes'; expected one of advisory, enforce. Falling back to enforce.",
      "Invalid action input severity-threshold 'urgent'; expected one of low, medium, high. Falling back to medium.",
      'Invalid action input sarif; expected boolean true or false. Falling back to true.',
      'Invalid action input patch; expected boolean true or false. Falling back to false.',
      'Invalid action input remote-validation; expected boolean true or false. Falling back to true.',
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
  })
})
