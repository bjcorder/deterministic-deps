import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadConfig, loadConfigWithDiagnostics } from '../src/config'

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
})
