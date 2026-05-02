import * as core from '@actions/core'
import { DEFAULT_EXCLUDE, DEFAULT_INCLUDE } from './constants'
import { loadConfig, normalizeMode, normalizeSeverity, splitPatterns } from './config'
import { countBySeverity, writeReports } from './report'
import { scan, resolveScanRoot } from './scanner'
import { shouldReportFailure } from './rules'

async function run(): Promise<void> {
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd()
  const scanRoot = resolveScanRoot(workspace, core.getInput('path') || '.')
  const configPath = core.getInput('config') || '.deterministic-deps.yml'
  const config = loadConfig(scanRoot, configPath)
  const mode = normalizeMode(core.getInput('mode'), config.mode ?? 'advisory')
  const severityThreshold = normalizeSeverity(
    core.getInput('severity-threshold'),
    config.severityThreshold ?? 'low'
  )
  const include = splitPatterns(core.getInput('include'))
  const exclude = splitPatterns(core.getInput('exclude'))
  const sarif = core.getBooleanInput('sarif')

  const result = await scan({
    root: scanRoot,
    include: include.length > 0 ? include : (config.include ?? DEFAULT_INCLUDE),
    exclude: exclude.length > 0 ? exclude : (config.exclude ?? DEFAULT_EXCLUDE),
    config
  })

  for (const finding of result.findings) {
    core.warning(`${finding.message} ${finding.remediation}`, {
      file: finding.file,
      startLine: finding.line,
      title: finding.ruleId
    })
  }

  const reports = writeReports(scanRoot, result.findings, sarif)
  const counts = countBySeverity(result.findings)

  core.setOutput('finding-count', result.findings.length.toString())
  core.setOutput('high-count', counts.high.toString())
  core.setOutput('medium-count', counts.medium.toString())
  core.setOutput('low-count', counts.low.toString())
  core.setOutput('report-path', reports.markdownPath)
  core.setOutput('sarif-path', reports.sarifPath ?? '')

  await core.summary
    .addHeading('deterministic-deps')
    .addRaw(`Scanned ${result.scannedFiles.length} files.\n\n`)
    .addRaw(
      `Findings: ${result.findings.length} (${counts.high} high, ${counts.medium} medium, ${counts.low} low)\n\n`
    )
    .addRaw(`Report: ${reports.markdownPath}\n`)
    .write()

  if (mode === 'enforce' && shouldReportFailure(result.findings, severityThreshold)) {
    core.setFailed(
      `deterministic-deps found ${result.findings.length} finding(s) at or above ${severityThreshold} severity.`
    )
  }
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error))
})
