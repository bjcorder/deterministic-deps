import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadConfig } from '../src/config'

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
        '  python:',
        '    requireRequirementHashes: false',
        ''
      ].join('\n'),
      'utf8'
    )

    const config = loadConfig(root, '.deterministic-deps.yml')

    expect(config.ecosystems?.node?.requireLockfile).toBe(false)
    expect(config.ecosystems?.node?.allowVersionRangesWithLockfile).toBe(true)
    expect(config.ecosystems?.python?.requireRequirementHashes).toBe(false)
  })
})
