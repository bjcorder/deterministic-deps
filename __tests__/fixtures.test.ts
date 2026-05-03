import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { renderMarkdown, renderPatch, renderSarif, writeReports } from '../src/report'
import { rules } from '../src/rules'
import { scan } from '../src/scanner'
import { Config, Finding } from '../src/types'

const fixturesRoot = path.join(__dirname, 'fixtures')
const goldensRoot = path.join(__dirname, 'goldens')

type ExpectedFinding = Pick<Finding, 'ruleId' | 'ecosystem' | 'file' | 'line' | 'severity'>

interface FixtureCase {
  name: string
  root: string
  config: Config
  expected: ExpectedFinding[]
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

function normalizeFindings(findings: Finding[]): ExpectedFinding[] {
  return findings
    .map((finding) => ({
      ruleId: finding.ruleId,
      ecosystem: finding.ecosystem,
      file: finding.file,
      line: finding.line,
      severity: finding.severity
    }))
    .sort(compareFindings)
}

function compareFindings(left: ExpectedFinding, right: ExpectedFinding): number {
  return (
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.ruleId.localeCompare(right.ruleId)
  )
}

function discoverFixtureCases(): FixtureCase[] {
  const cases: FixtureCase[] = []
  const stack = [fixturesRoot]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) {
      continue
    }

    const expectedPath = path.join(current, 'expected-findings.json')
    if (fs.existsSync(expectedPath)) {
      const configPath = path.join(current, 'config.json')
      cases.push({
        name: path.relative(fixturesRoot, current).replaceAll(path.sep, '/'),
        root: current,
        config: fs.existsSync(configPath) ? readJson<Config>(configPath) : {},
        expected: readJson<ExpectedFinding[]>(expectedPath).sort(compareFindings)
      })
      continue
    }

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        stack.push(path.join(current, entry.name))
      }
    }
  }

  return cases.sort((left, right) => left.name.localeCompare(right.name))
}

function documentedRuleIds(): string[] {
  const rules = fs.readFileSync(path.join(__dirname, '..', 'docs', 'rules.md'), 'utf8')
  return Array.from(rules.matchAll(/`([a-z-]+\/[a-z-]+)`/g), (match) => match[1]).sort()
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n')
}

describe('fixture matrix', () => {
  const fixtureCases = discoverFixtureCases()
  const unitCoveredRuleIds = ['remote/github-ref', 'remote/validation-error']

  it.each(fixtureCases)('$name', async (fixtureCase) => {
    const result = await scan({
      root: fixtureCase.root,
      include: [],
      exclude: [],
      config: fixtureCase.config
    })

    expect(normalizeFindings(result.findings)).toEqual(fixtureCase.expected)
  })

  it('covers every documented rule id with a failing fixture', () => {
    const coveredRuleIds = Array.from(
      new Set(
        fixtureCases
          .flatMap((fixtureCase) => fixtureCase.expected.map((finding) => finding.ruleId))
          .concat(unitCoveredRuleIds)
      )
    ).sort()

    expect(coveredRuleIds).toEqual(documentedRuleIds())
  })

  it('has registry metadata for every documented rule id', () => {
    const registryRuleIds = rules.map((rule) => rule.id).sort()

    expect(registryRuleIds).toEqual(documentedRuleIds())
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          ecosystem: expect.any(String),
          defaultSeverity: expect.stringMatching(/^(low|medium|high)$/),
          description: expect.any(String),
          evaluate: expect.any(Function)
        })
      ])
    )
    expect(rules.every((rule) => rule.description.length > 0)).toBe(true)
    expect(rules.every((rule) => /^(low|medium|high)$/.test(rule.defaultSeverity))).toBe(true)
    expect(rules.every((rule) => typeof rule.evaluate === 'function')).toBe(true)
  })

  it('includes at least one deterministic pass fixture for each ecosystem', () => {
    const passingEcosystems = new Set(
      fixtureCases
        .filter(
          (fixtureCase) =>
            fixtureCase.expected.length === 0 && !fixtureCase.name.startsWith('config/')
        )
        .map((fixtureCase) => fixtureCase.name.split('/')[0])
    )

    expect(Array.from(passingEcosystems).sort()).toEqual([
      'containers',
      'github-actions',
      'go',
      'jvm',
      'node',
      'python',
      'ruby',
      'rust',
      'terraform'
    ])
  })
})

describe('golden reports', () => {
  const findings: Finding[] = [
    {
      ruleId: 'github-actions/sha-pin',
      ecosystem: 'github-actions',
      file: '.github/workflows/ci.yml',
      line: 7,
      severity: 'high',
      message: "Action 'actions/checkout@v4' is pinned to 'v4', not a full commit SHA.",
      remediation: 'Replace branch, tag, or short SHA refs with a full 40-character commit SHA.'
    },
    {
      ruleId: 'containers/image-digest',
      ecosystem: 'containers',
      file: 'Dockerfile',
      line: 1,
      severity: 'medium',
      message: "Container image 'node:20' is not pinned by digest.",
      remediation: 'Use an immutable image reference such as name:tag@sha256:<digest>.'
    },
    {
      ruleId: 'rust/git-rev-sha',
      ecosystem: 'rust',
      file: 'Cargo.toml',
      line: 2,
      severity: 'high',
      message:
        'Rust git dependency \'demo = { git = "https://github.com/acme/demo.git?rev=0123456789abcdef0123456789abcdef01234567" }\' does not pin a rev commit SHA.',
      remediation: 'Add rev = "<40-character commit SHA>" to git dependencies.',
      suggestion: {
        title:
          "Add explicit Cargo rev '0123456789abcdef0123456789abcdef01234567' from the existing git URL.",
        confidence: 'high',
        safeToApply: true,
        replacement: {
          file: 'Cargo.toml',
          line: 2,
          oldText:
            'demo = { git = "https://github.com/acme/demo.git?rev=0123456789abcdef0123456789abcdef01234567" }',
          newText:
            'demo = { git = "https://github.com/acme/demo.git?rev=0123456789abcdef0123456789abcdef01234567", rev = "0123456789abcdef0123456789abcdef01234567" }'
        }
      }
    }
  ]

  it('matches the Markdown report golden', () => {
    const expected = normalizeLineEndings(
      fs.readFileSync(path.join(goldensRoot, 'report-findings.md'), 'utf8')
    )

    expect(renderMarkdown(findings)).toBe(expected)
  })

  it('matches the SARIF report golden', () => {
    const expected = normalizeLineEndings(
      fs.readFileSync(path.join(goldensRoot, 'report-findings.sarif.json'), 'utf8')
    )

    expect(`${JSON.stringify(renderSarif(findings), null, 2)}\n`).toBe(expected)
  })

  it('renders stable SARIF fingerprints for unchanged findings', () => {
    const first = renderSarif(findings) as {
      runs: Array<{ results: Array<{ partialFingerprints: Record<string, string> }> }>
    }
    const second = renderSarif(findings) as {
      runs: Array<{ results: Array<{ partialFingerprints: Record<string, string> }> }>
    }
    const fingerprints = first.runs[0].results.map((result) => result.partialFingerprints)

    expect(fingerprints).toEqual(second.runs[0].results.map((result) => result.partialFingerprints))
    expect(fingerprints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          primaryLocationLineHash: expect.stringMatching(/^[a-f0-9]{64}$/)
        })
      ])
    )
  })

  it('renders patch output for safe exact line replacements only', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deterministic-deps-report-'))
    fs.writeFileSync(
      path.join(root, 'Cargo.toml'),
      [
        '[dependencies]',
        'demo = { git = "https://github.com/acme/demo.git?rev=0123456789abcdef0123456789abcdef01234567" }',
        ''
      ].join('\n'),
      'utf8'
    )

    const patch = renderPatch(root, findings)

    expect(patch).toContain('diff --git a/Cargo.toml b/Cargo.toml')
    expect(patch).toContain(
      '+demo = { git = "https://github.com/acme/demo.git?rev=0123456789abcdef0123456789abcdef01234567", rev = "0123456789abcdef0123456789abcdef01234567" }'
    )
    expect(patch).not.toContain('.github/workflows/ci.yml')
  })

  it('writes optional patch reports and exposes the patch path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deterministic-deps-report-'))
    fs.writeFileSync(
      path.join(root, 'Cargo.toml'),
      [
        '[dependencies]',
        'demo = { git = "https://github.com/acme/demo.git?rev=0123456789abcdef0123456789abcdef01234567" }',
        ''
      ].join('\n'),
      'utf8'
    )

    const reports = writeReports(root, findings, false, true)

    expect(reports.sarifPath).toBeUndefined()
    expect(reports.patchPath).toBe(
      path.join(root, 'deterministic-deps-report', 'suggestions.patch')
    )
    expect(reports.patchPath).toBeDefined()
    expect(fs.readFileSync(reports.patchPath ?? '', 'utf8')).toContain('diff --git')
  })
})
