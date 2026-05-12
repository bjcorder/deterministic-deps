import { containsCredentialMaterial, sanitizeDisplayValue } from '../src/redaction'

describe('credential redaction', () => {
  it('redacts URL userinfo and sensitive query parameters', () => {
    expect(
      sanitizeDisplayValue(
        'git+https://user:secret@example.com/acme/demo.git?token=abc123&ref=main'
      )
    ).toBe('git+https://[REDACTED]@example.com/acme/demo.git?token=[REDACTED]&ref=main')

    expect(
      sanitizeDisplayValue(
        'https://registry.example.com/image:latest?access_token=secret&sig=signature'
      )
    ).toBe('https://registry.example.com/image:latest?access_token=[REDACTED]&sig=[REDACTED]')
  })

  it('redacts bearer, basic, and authorization-style values', () => {
    expect(sanitizeDisplayValue('Authorization: Bearer abc.def.ghi')).toBe(
      'Authorization: Bearer [REDACTED]'
    )
    expect(sanitizeDisplayValue('auth=Basic abc123')).toBe('auth=Basic [REDACTED]')
    expect(sanitizeDisplayValue('Bearer abc123')).toBe('Bearer [REDACTED]')
  })

  it('detects credential material without flagging ordinary refs', () => {
    expect(containsCredentialMaterial('https://user:secret@example.com/repo.git')).toBe(true)
    expect(containsCredentialMaterial('https://example.com/repo.git?ref=main')).toBe(false)
    expect(containsCredentialMaterial('actions/checkout@v4')).toBe(false)
  })
})
