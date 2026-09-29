import { describe, expect, it } from 'vitest'
import { clientLabel, clientName } from './client-name'

describe('client-name', () => {
  it('prefers the contact name, falls back to the company', () => {
    expect(clientName({ display_name: 'Cristiano Ronaldo', company_name: 'Soccer Center LLC' })).toBe('Cristiano Ronaldo')
    expect(clientName({ display_name: ' ', company_name: 'Soccer Center LLC' })).toBe('Soccer Center LLC')
    expect(clientName(null, '(unnamed)')).toBe('(unnamed)')
  })

  it('labels with the company when it differs', () => {
    expect(clientLabel({ display_name: 'Cristiano Ronaldo', company_name: 'Soccer Center LLC' }))
      .toBe('Cristiano Ronaldo · Soccer Center LLC')
    expect(clientLabel({ display_name: 'Acme', company_name: 'Acme' })).toBe('Acme')
    expect(clientLabel({ display_name: null, company_name: 'Acme' })).toBe('Acme')
  })
})
