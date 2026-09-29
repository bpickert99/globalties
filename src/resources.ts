import type { Resource, ResourceCategory, ResourceContact, ScheduleItem } from './types'

export const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  nonprofit: 'Nonprofit',
  government: 'Government',
  education: 'Education',
  business: 'Business',
  cultural: 'Cultural / tourism',
  media: 'Media',
  health: 'Health',
  faith: 'Faith',
  other: 'Other',
}

export const CATEGORY_COLORS: Record<ResourceCategory, string> = {
  nonprofit: '#2e7d4f',
  government: '#1f3a5f',
  education: '#6b4fa0',
  business: '#0f7c8c',
  cultural: '#d9822b',
  media: '#b3261e',
  health: '#c2185b',
  faith: '#7a5c2e',
  other: '#5d6878',
}

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as ResourceCategory[]

// The resource a meeting/activity visits; throws if the link is broken.
export function resourceOf(item: ScheduleItem, resources: Resource[]): Resource {
  const r = resources.find((x) => x.id === item.resource_id)
  if (!r) throw new Error(`"${item.title}" points to a resource that no longer exists`)
  return r
}

// Contacts from the resource chosen for this particular visit.
export function visitContacts(item: ScheduleItem, resource: Resource): ResourceContact[] {
  return resource.contacts.filter((c) => item.contact_ids.includes(c.id))
}

// Unit designators ("Ste 100", "Suite 405", "Room 414", "#2", "2nd Floor") are dropped
// before lookup: they aren't needed to place a building and street geocoders reject them.
export function geocodeQuery(address: string): string {
  return address
    .replace(/\n/g, ', ')
    .replace(/,?\s*(suite|ste\.?|room|rm\.?|unit|apt\.?|#)\s*[\w-]+/gi, '')
    .replace(/,?\s*\d+(st|nd|rd|th)\s+floor/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// OpenStreetMap Nominatim: one request per save, never per keystroke (usage policy).
export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.search = new URLSearchParams({ q: geocodeQuery(address), format: 'jsonv2', limit: '1', countrycodes: 'us' }).toString()
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Address lookup failed (${res.status})`)
  const [hit] = (await res.json()) as { lat: string; lon: string }[]
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null
}
