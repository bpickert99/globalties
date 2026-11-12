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

// Everyone the group met at this visit (point of contact and speakers), e.g. to thank them.
export function visitContacts(item: ScheduleItem, resource: Resource): ResourceContact[] {
  return resource.contacts.filter((c) => item.contact_ids.includes(c.id) || item.speaker_ids.includes(c.id))
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

export type AddressMatch = { street: string; cityLine: string; lat: number; lng: number }

type NominatimHit = { lat: string; lon: string; name: string; address: Record<string, string | undefined> }

// "Ste 100", "Room 414" … from what was typed, kept on the street line of a looked-up address.
const unitsOf = (typed: string) =>
  (typed.match(/(suite|ste\.?|room|rm\.?|unit|apt\.?|#)\s*[\w-]+|\d+(st|nd|rd|th)\s+floor/gi) ?? []).map((u) => u[0].toUpperCase() + u.slice(1)).join(' ')

function toMatch(hit: NominatimHit, typed: string): AddressMatch {
  const a = hit.address
  const street = [a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road || hit.name, unitsOf(typed)].filter(Boolean).join(' ')
  const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? ''
  const state = (a['ISO3166-2-lvl4'] ?? '').replace(/^US-/, '')
  return { street, cityLine: `${[city, state].filter(Boolean).join(', ')} ${a.postcode ?? ''}`.trim(), lat: Number(hit.lat), lng: Number(hit.lon) }
}

// OpenStreetMap Nominatim: one request per click or save, never per keystroke (its usage policy
// forbids search-as-you-type).
export async function lookupAddress(typed: string, limit: number): Promise<AddressMatch[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.search = new URLSearchParams({ q: geocodeQuery(typed), format: 'jsonv2', addressdetails: '1', limit: String(limit), countrycodes: 'us' }).toString()
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Address lookup failed (${res.status})`)
  return ((await res.json()) as NominatimHit[]).map((h) => toMatch(h, typed))
}

export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const [hit] = await lookupAddress(address, 1)
  return hit ? { lat: hit.lat, lng: hit.lng } : null
}

// Map pin for a new or changed address, with a note for the user when it couldn't be placed.
export async function locate(address: string): Promise<{ lat: number | null; lng: number | null; notice: string | null }> {
  if (!address.trim()) return { lat: null, lng: null, notice: null }
  try {
    const hit = await geocode(address)
    if (hit) return { ...hit, notice: null }
    return { lat: null, lng: null, notice: `Couldn't find "${address}" on the map. Open the resource and use "Set pin on map" to place it.` }
  } catch (err) {
    return { lat: null, lng: null, notice: `${(err as Error).message}. The resource was saved without a map pin.` }
  }
}
