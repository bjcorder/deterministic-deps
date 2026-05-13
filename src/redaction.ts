import { Finding } from './types'

const REDACTED = '[REDACTED]'
const SENSITIVE_QUERY_KEYS = [
  'token',
  'access_token',
  'password',
  'passwd',
  'pwd',
  'secret',
  'client_secret',
  'api_key',
  'apikey',
  'key',
  'auth',
  'authorization',
  'signature',
  'sig'
]

const SENSITIVE_QUERY_PATTERN = new RegExp(
  `([?&;])([^=&#\\s'"<>)]{1,100})(=)([^&#\\s'"<>)]*)`,
  'gi'
)

export function sanitizeDisplayValue(value: string): string {
  return value
    .replace(/\b([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^/\s'"<>@]+@)/g, `$1${REDACTED}@`)
    .replace(/\b([^/\s'"<>:@]+:[^/\s'"<>@]+@)([A-Za-z0-9.-]+(?::\d+)?\/)/g, `${REDACTED}@$2`)
    .replace(SENSITIVE_QUERY_PATTERN, (match, separator: string, key: string, equals: string) =>
      isSensitiveQueryKey(key) ? `${separator}${key}${equals}${REDACTED}` : match
    )
    .replace(
      /\b(Authorization\s*[:=]\s*)(Bearer|Basic)?\s*[^,\s'"<>)}\]]+/gi,
      (_match, prefix: string, scheme?: string) =>
        `${prefix}${scheme ? `${scheme} ` : ''}${REDACTED}`
    )
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`)
}

export function sanitizeFinding(finding: Finding): Finding {
  const suggestion = finding.suggestion
  const replacement = suggestion?.replacement
  const replacementHasCredentialMaterial = replacement
    ? containsCredentialMaterial(replacement.oldText) ||
      containsCredentialMaterial(replacement.newText)
    : false

  return {
    ...finding,
    message: sanitizeDisplayValue(finding.message),
    remediation: sanitizeDisplayValue(finding.remediation),
    suggestion: suggestion
      ? {
          ...suggestion,
          title: sanitizeDisplayValue(suggestion.title),
          safeToApply: replacementHasCredentialMaterial ? false : suggestion.safeToApply,
          replacement: replacement
            ? {
                ...replacement,
                oldText: sanitizeDisplayValue(replacement.oldText),
                newText: sanitizeDisplayValue(replacement.newText)
              }
            : undefined
        }
      : undefined
  }
}

export function containsCredentialMaterial(value: string): boolean {
  return sanitizeDisplayValue(value) !== value
}

function isSensitiveQueryKey(key: string): boolean {
  const normalized = normalizeQueryKey(key)
  if (SENSITIVE_QUERY_KEYS.includes(normalized)) {
    return true
  }

  const compact = normalized.replace(/[^a-z0-9]/g, '')
  const parts = normalized.split(/[^a-z0-9]+/).filter(Boolean)
  const sensitiveWords = [
    'token',
    'secret',
    'credential',
    'password',
    'passwd',
    'pwd',
    'apikey',
    'auth',
    'authorization',
    'signature',
    'sig'
  ]

  return sensitiveWords.some(
    (word) => compact === word || compact.endsWith(word) || parts.includes(word)
  )
}

function normalizeQueryKey(key: string): string {
  const decoded = safeDecodeURIComponent(key)
  return decoded
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase()
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}
