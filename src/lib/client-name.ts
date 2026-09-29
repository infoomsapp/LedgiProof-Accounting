// PATH: src/lib/client-name.ts
//
// One way to name a client in pickers and lists. The Clients page treats
// display_name (the contact) as the primary name and company_name as the
// business, so a picker showing only one of them made the same client look
// like two ("Cristiano Ronaldo" in Notes vs "Soccer Center LLC" in Reports).

type NamedClient = { display_name: string | null; company_name: string | null } | null | undefined

export function clientName(c: NamedClient, fallback = ''): string {
  return c?.display_name?.trim() || c?.company_name?.trim() || fallback
}

/** "Contact · Company" when both exist and differ, otherwise the one name. */
export function clientLabel(c: NamedClient, fallback = ''): string {
  const name    = clientName(c, fallback)
  const company = c?.company_name?.trim()
  return company && company !== name ? `${name} · ${company}` : name
}
