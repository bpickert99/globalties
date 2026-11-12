import { useState } from 'react'
import type { TabProps } from '../pages/Project'
import { must, supabase } from '../supabase'
import type { HostGroup } from '../types'
import { act } from '../ui'
import HostGroupsEditor from './HostGroups'

// For groups that stay with host families instead of a hotel: who hosts whom for the whole stay.
export default function HostFamilies({ data, reload }: TabProps) {
  const { project } = data
  const [families, setFamilies] = useState<HostGroup[]>(project.host_families)
  const dirty = JSON.stringify(families) !== JSON.stringify(project.host_families)

  async function save() {
    if (await act(async () => must(await supabase.from('projects').update({ host_families: families }).eq('id', project.id)))) await reload()
  }

  return (
    <div className="stack">
      <div className="savebar">
        <button className="btn primary" disabled={!dirty} onClick={save}>
          Save host families
        </button>
        {dirty && <span className="muted small">Unsaved changes</span>}
      </div>
      <section className="card form">
        <h2>Host families</h2>
        <p className="muted small">This group stays with host families instead of a hotel. The families and their guests are listed on the itinerary.</p>
        <HostGroupsEditor label="Families and their guests" unit="family" people={data.people} value={families} onChange={setFamilies} />
      </section>
    </div>
  )
}
