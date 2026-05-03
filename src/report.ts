import fs from 'node:fs'
import path from 'node:path'
import { Finding, LineReplacement, ReportResult, Severity } from './types'

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  return {
    high: findings.filter((finding) => finding.severity === 'high').length,
    medium: findings.filter((finding) => finding.severity === 'medium').length,
    low: findings.filter((finding) => finding.severity === 'low').length
  }
}

export function writeReports(
  root: string,
  findings: Finding[],
  writeSarif: boolean,
  writePatch = false
): ReportResult {
  const outputDir = path.join(root, 'deterministic-deps-report')
  fs.mkdirSync(outputDir, { recursive: true })

  const markdownPath = path.join(outputDir, 'report.md')
  fs.writeFileSync(markdownPath, renderMarkdown(findings), 'utf8')

  const patchPath = writePatch ? path.join(outputDir, 'suggestions.patch') : undefined
  if (patchPath) {
    fs.writeFileSync(patchPath, renderPatch(root, findings), 'utf8')
  }

  if (!writeSarif) {
    return { markdownPath, patchPath }
  }

  const sarifPath = path.join(outputDir, 'deterministic-deps.sarif')
  fs.writeFileSync(sarifPath, JSON.stringify(renderSarif(findings), null, 2), 'utf8')

  return { markdownPath, sarifPath, patchPath }
}

export function renderMarkdown(findings: Finding[]): string {
  const counts = countBySeverity(findings)
  const lines = [
    '# deterministic-deps report',
    '',
    `Total findings: ${findings.length}`,
    '',
    `High: ${counts.high}`,
    `Medium: ${counts.medium}`,
    `Low: ${counts.low}`,
    ''
  ]

  if (findings.length === 0) {
    lines.push('No non-deterministic dependency declarations were found.', '')
    return lines.join('\n')
  }

  lines.push('| Severity | Rule | Ecosystem | Location | Message | Remediation |')
  lines.push('| --- | --- | --- | --- | --- | --- |')
  for (const finding of findings) {
    lines.push(
      `| ${finding.severity} | ${finding.ruleId} | ${finding.ecosystem} | ${finding.file}:${finding.line} | ${escapeMarkdown(finding.message)} | ${escapeMarkdown(finding.remediation)} |`
    )
  }

  const suggestions = findings.filter((finding) => finding.suggestion)
  if (suggestions.length > 0) {
    lines.push('', '## Suggestions', '')
    for (const finding of suggestions) {
      const suggestion = finding.suggestion
      if (!suggestion) {
        continue
      }
      lines.push(
        `- ${finding.file}:${finding.line} ${escapeMarkdown(suggestion.title)} (confidence: ${suggestion.confidence}; safe patch: ${suggestion.safeToApply ? 'yes' : 'no'})`
      )
      if (suggestion.replacement) {
        lines.push(
          `  - Replace line ${suggestion.replacement.line} with: \`${escapeMarkdown(suggestion.replacement.newText)}\``
        )
      }
    }
  }

  lines.push('')
  return lines.join('\n')
}

export function renderSarif(findings: Finding[]): object {
  const rules = Array.from(new Set(findings.map((finding) => finding.ruleId))).map((ruleId) => ({
    id: ruleId,
    shortDescription: {
      text: ruleId
    }
  }))

  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'deterministic-deps',
            informationUri: 'https://github.com/bjcorder/deterministic-deps',
            rules
          }
        },
        results: findings.map((finding) => {
          const result: Record<string, unknown> = {
            ruleId: finding.ruleId,
            level: sarifLevel(finding.severity),
            message: {
              text: `${finding.message} ${finding.remediation}`
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: finding.file
                  },
                  region: {
                    startLine: finding.line
                  }
                }
              }
            ],
            properties: {
              ecosystem: finding.ecosystem,
              severity: finding.severity
            }
          }

          const replacement = safeReplacement(finding)
          if (replacement) {
            result.fixes = [
              {
                description: {
                  text: finding.suggestion?.title ?? finding.remediation
                },
                artifactChanges: [
                  {
                    artifactLocation: {
                      uri: replacement.file
                    },
                    replacements: [
                      {
                        deletedRegion: {
                          startLine: replacement.line,
                          endLine: replacement.line
                        },
                        insertedContent: {
                          text: `${replacement.newText}\n`
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          }

          return result
        })
      }
    ]
  }
}

export function renderPatch(root: string, findings: Finding[]): string {
  const replacements = findings
    .map((finding) => safeReplacement(finding))
    .filter((replacement): replacement is LineReplacement => Boolean(replacement))
    .filter((replacement) => replacementMatchesFile(root, replacement))

  if (replacements.length === 0) {
    return ''
  }

  const lines: string[] = []
  for (const replacement of replacements) {
    lines.push(
      `diff --git a/${replacement.file} b/${replacement.file}`,
      `--- a/${replacement.file}`,
      `+++ b/${replacement.file}`,
      `@@ -${replacement.line},1 +${replacement.line},1 @@`,
      `-${replacement.oldText}`,
      `+${replacement.newText}`
    )
  }

  lines.push('')
  return lines.join('\n')
}

function safeReplacement(finding: Finding): LineReplacement | undefined {
  const suggestion = finding.suggestion
  if (!suggestion?.safeToApply || !suggestion.replacement) {
    return undefined
  }

  return suggestion.replacement
}

function replacementMatchesFile(root: string, replacement: LineReplacement): boolean {
  const filePath = path.join(root, replacement.file)
  if (!fs.existsSync(filePath)) {
    return false
  }

  const line = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)[replacement.line - 1]
  return line === replacement.oldText
}

function sarifLevel(severity: Severity): 'error' | 'warning' | 'note' {
  if (severity === 'high') {
    return 'error'
  }
  if (severity === 'medium') {
    return 'warning'
  }
  return 'note'
}

function escapeMarkdown(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
}
