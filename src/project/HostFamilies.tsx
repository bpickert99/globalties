import { useState } from 'react'
import { SaveStatus, useAutosave } from '../autosave'
import type { TabProps } from '../pages/Project'
import { must, supabase } from '../supabase'
import type { HostGroup } from '../types'
import HostGroupsEditor from './HostGroups'

// For groups that stay with host families instead of a hotel: who hosts whom for the whole stay.
export default function HostFamilies({ data, reload }: TabProps) {
  const { project } = data
  const [families, setFamilies] = useState<HostGroup[]>(project.host_families)
  const saving = useAutosave(families, async (host_families) => {
    must(await supabase.from('projects').update({ host_families }).eq('id', project.id))
    await reload()
  })

  return (
    <div className="stack">
      <div className="savebar">
        <SaveStatus state={saving} />
      </div>
      <section className="card form">
        <h2>Host families</h2>
        <p className="muted small">This group stays with host families instead of a hotel. The families and their guests are listed on the itinerary.</p>
        <HostGroupsEditor label="Families and their guests" unit="family" people={data.people} value={families} onChange={setFamilies} />
      </section>
    </div>
  )
}
