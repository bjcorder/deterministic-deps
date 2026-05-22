import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  SARIF_FINGERPRINT_VERSION,
  countBySeverity,
  renderMarkdown,
  renderPatch,
  renderSarif,
  writeReports
} from '../src/report'
import { Finding } from '../src/types'

function tempRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'deterministic-deps-report-'))
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'node/non-deterministic-spec',
    ecosystem: 'node',
    file: 'package.json',
    line: 7,
    severity: 'medium',
    message: 'Dependency declared with a version range.',
    remediation: 'Pin the dependency to an exact version.',
    ...overrides
  }
}

describe('countBySeverity', () => {
  it('returns zero counts for an empty findings array', () => {
    expect(countBySeverity([])).toEqual({ high: 0, medium: 0, low: 0 })
  })

  it('tallies findings by severity', () => {
    const findings = [
      makeFinding({ severity: 'high' }),
      makeFinding({ severity: 'high' }),
      makeFinding({ severity: 'medium' }),
      makeFinding({ severity: 'low' }),
      makeFinding({ severity: 'low' }),
      makeFinding({ severity: 'low' })
    ]

    expect(countBySeverity(findings)).toEqual({ high: 2, medium: 1, low: 3 })
  })
})

describe('renderMarkdown', () => {
  it('renders an empty-state report when there are no findings', () => {
    const markdown = renderMarkdown([])

    expect(markdown).toContain('Total findings: 0')
    expect(markdown).toContain('No non-deterministic dependency declarations were found.')
  })

  it('renders one row per finding and summarizes counts', () => {
    const findings = [
      makeFinding({ severity: 'high', ruleId: 'rule.a' }),
      makeFinding({ severity: 'low', ruleId: 'rule.b' })
    ]

    const markdown = renderMarkdown(findings)

    expect(markdown).toContain('Total findings: 2')
    expect(markdown).toContain('High: 1')
    expect(markdown).toContain('Low: 1')
    expect(markdown).toContain('rule.a')
    expect(markdown).toContain('rule.b')
  })

  it('escapes file paths and replacement text in Markdown locations', () => {
    const markdown = renderMarkdown([
      makeFinding({
        file: 'pkg|name\npackage.json',
        suggestion: {
          title: 'Pin',
          confidence: 'high',
          safeToApply: true,
          replacement: {
            file: 'pkg-name/package.json',
            line: 7,
            oldText: '"dep": "^1.0.0"',
            newText: '`spoofed`'
          }
        }
      })
    ])

    expect(markdown).toContain('pkg\\|name package.json:7')
    expect(markdown).toContain('\\`spoofed\\`')
    expect(markdown).not.toContain('pkg|name\npackage.json')
  })

  it('redacts credential material that appears in messages', () => {
    const finding = makeFinding({
      message: 'Authorization: Bearer ghp_supersecrettoken1234567890abcdef found in lockfile.'
    })

    const markdown = renderMarkdown([finding])

    expect(markdown).not.toContain('ghp_supersecrettoken1234567890abcdef')
    expect(markdown).toContain('[REDACTED]')
  })
})

describe('renderSarif', () => {
  it('produces a 2.1.0 SARIF document with one result per finding', () => {
    const findings = [
      makeFinding({ severity: 'high' }),
      makeFinding({ severity: 'medium', file: 'requirements.txt', line: 3 })
    ]

    const sarif = renderSarif(findings) as Record<string, unknown>
    const runs = sarif.runs as Array<Record<string, unknown>>

    expect(sarif.version).toBe('2.1.0')
    expect(runs).toHaveLength(1)
    const results = runs[0].results as Array<Record<string, unknown>>
    expect(results).toHaveLength(2)
    expect(results[0].level).toBe('error')
    expect(results[1].level).toBe('warning')
  })

  it('maps severities to SARIF levels: high->error, medium->warning, low->note', () => {
    const findings = [
      makeFinding({ severity: 'high' }),
      makeFinding({ severity: 'medium' }),
      makeFinding({ severity: 'low' })
    ]

    const sarif = renderSarif(findings) as Record<string, unknown>
    const results = (sarif.runs as Array<Record<string, unknown>>)[0].results as Array<
      Record<string, unknown>
    >

    expect(results.map((result) => result.level)).toEqual(['error', 'warning', 'note'])
  })

  it('produces stable fingerprints when called repeatedly with the same finding', () => {
    const finding = makeFinding()

    const first = renderSarif([finding]) as Record<string, unknown>
    const second = renderSarif([finding]) as Record<string, unknown>

    const firstFingerprint = (
      (first.runs as Array<Record<string, unknown>>)[0].results as Array<Record<string, unknown>>
    )[0].partialFingerprints
    const secondFingerprint = (
      (second.runs as Array<Record<string, unknown>>)[0].results as Array<Record<string, unknown>>
    )[0].partialFingerprints

    expect(firstFingerprint).toEqual(secondFingerprint)
  })

  it('exports the fingerprint version constant for downstream reference', () => {
    expect(SARIF_FINGERPRINT_VERSION).toBe('v1')
  })
})

describe('renderPatch', () => {
  it('returns an empty string when no finding carries a safe replacement', () => {
    expect(renderPatch(tempRepo(), [])).toBe('')
    expect(renderPatch(tempRepo(), [makeFinding()])).toBe('')
  })

  it('emits unified-diff hunks only for replacements whose oldText still matches the file', () => {
    const root = tempRepo()
    fs.writeFileSync(path.join(root, 'package.json'), '"dep": "^1.0.0"\n', 'utf8')

    const finding = makeFinding({
      file: 'package.json',
      line: 1,
      suggestion: {
        title: 'Pin to an exact version',
        confidence: 'high',
        safeToApply: true,
        replacement: {
          file: 'package.json',
          line: 1,
          oldText: '"dep": "^1.0.0"',
          newText: '"dep": "1.0.0"'
        }
      }
    })

    const patch = renderPatch(root, [finding])

    expect(patch).toContain('diff --git a/package.json b/package.json')
    expect(patch).toContain('-"dep": "^1.0.0"')
    expect(patch).toContain('+"dep": "1.0.0"')
  })

  it('skips replacements whose captured oldText no longer matches the on-disk content', () => {
    const root = tempRepo()
    fs.writeFileSync(path.join(root, 'package.json'), '"dep": "2.0.0"\n', 'utf8')

    const finding = makeFinding({
      file: 'package.json',
      line: 1,
      suggestion: {
        title: 'Pin',
        confidence: 'high',
        safeToApply: true,
        replacement: {
          file: 'package.json',
          line: 1,
          oldText: '"dep": "^1.0.0"',
          newText: '"dep": "1.0.0"'
        }
      }
    })

    expect(renderPatch(root, [finding])).toBe('')
  })

  it('rejects unsafe replacement paths and patch line injection', () => {
    const root = tempRepo()
    fs.writeFileSync(path.join(root, 'package.json'), '"dep": "^1.0.0"\n', 'utf8')

    const unsafeFindings = [
      makeFinding({
        suggestion: {
          title: 'Escape root',
          confidence: 'high',
          safeToApply: true,
          replacement: {
            file: '../outside/package.json',
            line: 1,
            oldText: '"dep": "^1.0.0"',
            newText: '"dep": "1.0.0"'
          }
        }
      }),
      makeFinding({
        suggestion: {
          title: 'Inject patch line',
          confidence: 'high',
          safeToApply: true,
          replacement: {
            file: 'package.json',
            line: 1,
            oldText: '"dep": "^1.0.0"',
            newText: '"dep": "1.0.0"\n--- a/other\n+++ b/other'
          }
        }
      })
    ]

    expect(renderPatch(root, unsafeFindings)).toBe('')
    const sarif = renderSarif(unsafeFindings) as {
      runs: Array<{ results: Array<{ fixes?: unknown }> }>
    }
    expect(sarif.runs[0].results.every((result) => result.fixes === undefined)).toBe(true)
  })

  it('rejects patch replacements that resolve outside the root through symlinks', () => {
    const root = tempRepo()
    const outside = tempRepo()
    fs.writeFileSync(path.join(outside, 'package.json'), '"dep": "^1.0.0"\n', 'utf8')
    fs.symlinkSync(outside, path.join(root, 'outside-link'), 'dir')

    expect(
      renderPatch(root, [
        makeFinding({
          file: 'outside-link/package.json',
          line: 1,
          suggestion: {
            title: 'Pin',
            confidence: 'high',
            safeToApply: true,
            replacement: {
              file: 'outside-link/package.json',
              line: 1,
              oldText: '"dep": "^1.0.0"',
              newText: '"dep": "1.0.0"'
            }
          }
        })
      ])
    ).toBe('')
  })

  it('omits SARIF fixes when finding and replacement locations disagree', () => {
    const sarif = renderSarif([
      makeFinding({
        file: 'package.json',
        line: 1,
        suggestion: {
          title: 'Pin',
          confidence: 'high',
          safeToApply: true,
          replacement: {
            file: 'other-package.json',
            line: 1,
            oldText: '"dep": "^1.0.0"',
            newText: '"dep": "1.0.0"'
          }
        }
      })
    ]) as { runs: Array<{ results: Array<{ fixes?: unknown }> }> }

    expect(sarif.runs[0].results[0].fixes).toBeUndefined()
  })

  it('allows safe workspace files whose names start with dot dots', () => {
    const root = tempRepo()
    fs.writeFileSync(path.join(root, '..package.json'), '"dep": "^1.0.0"\n', 'utf8')

    const patch = renderPatch(root, [
      makeFinding({
        file: '..package.json',
        line: 1,
        suggestion: {
          title: 'Pin',
          confidence: 'high',
          safeToApply: true,
          replacement: {
            file: '..package.json',
            line: 1,
            oldText: '"dep": "^1.0.0"',
            newText: '"dep": "1.0.0"'
          }
        }
      })
    ])

    expect(patch).toContain('diff --git a/..package.json b/..package.json')
  })
})

describe('writeReports', () => {
  it('writes markdown by default and sarif/patch when requested', () => {
    const root = tempRepo()
    fs.writeFileSync(path.join(root, 'package.json'), '"dep": "^1.0.0"\n', 'utf8')

    const findings = [
      makeFinding({
        file: 'package.json',
        line: 1,
        suggestion: {
          title: 'Pin',
          confidence: 'high',
          safeToApply: true,
          replacement: {
            file: 'package.json',
            line: 1,
            oldText: '"dep": "^1.0.0"',
            newText: '"dep": "1.0.0"'
          }
        }
      })
    ]

    const result = writeReports(root, findings, true, true)

    expect(fs.existsSync(result.markdownPath)).toBe(true)
    expect(result.sarifPath).toBeDefined()
    expect(fs.existsSync(result.sarifPath as string)).toBe(true)
    expect(result.patchPath).toBeDefined()
    expect(fs.existsSync(result.patchPath as string)).toBe(true)

    const sarif = JSON.parse(fs.readFileSync(result.sarifPath as string, 'utf8'))
    expect(sarif.version).toBe('2.1.0')
  })

  it('omits the sarif file when writeSarif is false', () => {
    const root = tempRepo()
    const result = writeReports(root, [makeFinding()], false)

    expect(result.sarifPath).toBeUndefined()
  })

  it('rejects report output directories that resolve outside the scan root', () => {
    const root = tempRepo()
    const outside = tempRepo()
    fs.symlinkSync(outside, path.join(root, 'deterministic-deps-report'), 'dir')

    expect(() => writeReports(root, [makeFinding()], true, true)).toThrow(
      'Report output directory must resolve inside the scan root.'
    )
    expect(fs.existsSync(path.join(outside, 'report.md'))).toBe(false)
  })
})
