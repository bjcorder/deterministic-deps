import fs from 'node:fs'
import path from 'node:path'
import { Finding, ReportResult, Severity } from './types'

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  return {
    high: findings.filter((finding) => finding.severity === 'high').length,
    medium: findings.filter((finding) => finding.severity === 'medium').length,
    low: findings.filter((finding) => finding.severity === 'low').length
  }
}

export function writeReports(root: string, findings: Finding[], writeSarif: boolean): ReportResult {
  const outputDir = path.join(root, 'deterministic-deps-report')
  fs.mkdirSync(outputDir, { recursive: true })

  const markdownPath = path.join(outputDir, 'report.md')
  fs.writeFileSync(markdownPath, renderMarkdown(findings), 'utf8')

  if (!writeSarif) {
    return { markdownPath }
  }

  const sarifPath = path.join(outputDir, 'deterministic-deps.sarif')
  fs.writeFileSync(sarifPath, JSON.stringify(renderSarif(findings), null, 2), 'utf8')

  return { markdownPath, sarifPath }
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
        results: findings.map((finding) => ({
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
        }))
      }
    ]
  }
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
