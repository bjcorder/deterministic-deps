import fs from 'node:fs'
import path from 'node:path'
import yaml from 'osl-js-yaml'

describe('action metadata', () => {
  it('does not set metadata defaults for config-overridable policy inputs', () => {
    const metadata = yaml.load(
      fs.readFileSync(path.join(__dirname, '..', 'action.yml'), 'utf8')
    ) as { inputs: Record<string, { default?: string }> }

    for (const inputName of [
      'mode',
      'severity-threshold',
      'patch',
      'remote-validation',
      'remote-token-policy',
      'remote-timeout-ms',
      'remote-retries'
    ]) {
      expect(metadata.inputs[inputName]).not.toHaveProperty('default')
    }
  })
})
