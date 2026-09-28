// Row types mirroring supabase/migrations.

export type Anchor = 'accepted' | 'arrival' | 'departure'
export type Requires = 'none' | 'home_hospitality' | 'event'
export type EmailKey =
  | 'hotel_request'
  | 'hotel_npa_connect'
  | 'transport_request'
  | 'hh_host_details'
  | 'partner_thanks'
  | 'hh_thanks'

export type Contact = { name: string; title: string; phone: string; email: string }

export type Settings = {
  id: true
  office_address: string
  transport_block: string
  transport_contact_name: string
  transport_email: string
  cc_name: string
  cc_email: string
  ceo_email: string
  survey_url: string
}

export type Staff = {
  id: string
  name: string
  title: string
  office_phone: string
  mobile_phone: string
  email: string
  emergency_contact: boolean
  sort: number
}

export type ProgramType = { id: string; name: string; sort: number; itinerary_intro: string }

export type TaskTemplate = {
  id: string
  program_type_id: string
  phase: string
  title: string
  details: string
  anchor: Anchor
  offset_days: number
  requires: Requires
  email_key: EmailKey | null
  sort: number
}

export type Project = {
  id: string
  program_type_id: string
  name: string
  subtitle: string
  reference: string
  countries: string
  accepted_on: string
  arrival_date: string
  departure_date: string
  sharepoint_url: string
  npa_org: string
  npa_contacts: Contact[]
  oiv_contacts: Contact[]
  hotel_name: string
  hotel_address: string
  hotel_phone: string
  hotel_contact_name: string
  hotel_contact_email: string
  hotel_rate: string
  hotel_blurb: string
  drivers: Contact[]
  home_hospitality: boolean
  has_event: boolean
  notes: string
  closed_at: string | null
  created_at: string
}

export type Task = {
  id: string
  project_id: string | null
  phase: string
  title: string
  details: string
  anchor: Anchor | null
  offset_days: number | null
  due_date: string | null
  requires: Requires
  email_key: EmailKey | null
  enabled: boolean
  done_at: string | null
  sort: number
  created_at: string
}

export type ParticipantRole = 'participant' | 'interpreter' | 'liaison'
export type MediaConsent = 'unknown' | 'yes' | 'no'

export type Participant = {
  id: string
  project_id: string
  role: ParticipantRole
  given_name: string
  family_name: string
  position: string
  country: string
  phone: string
  email: string
  dietary: string
  media_consent: MediaConsent
  arrival_flight: string
  departure_flight: string
  hotel_confirmation: string
  bio: string
  notes: string
  cancelled_at: string | null
  sort: number
  created_at: string
}

export type ItemKind = 'meeting' | 'meal' | 'activity' | 'home_hospitality' | 'transport' | 'flight' | 'note'
export type MeetingStatus = 'planned' | 'requested' | 'confirmed' | 'declined' | 'thanked'

export type Restaurant = { name: string; address: string; description: string }

export type HostGroup = {
  host: string
  address: string
  phone: string
  email: string
  bio: string
  participant_ids: string[]
}

export type ScheduleItem = {
  id: string
  project_id: string
  day: string
  start_time: string | null
  end_time: string | null
  kind: ItemKind
  title: string
  location: string
  address: string
  directions: string
  contacts: Contact[]
  topic: string
  description: string
  restaurants: Restaurant[]
  hh_groups: HostGroup[]
  status: MeetingStatus | null
  status_changed_at: string
  internal_notes: string
  created_at: string
}
