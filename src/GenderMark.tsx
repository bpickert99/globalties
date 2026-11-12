import type { Gender } from './types'

export const GENDER_LABEL: Record<Gender, string> = { female: 'Female', male: 'Male', '': 'Gender not recorded' }
const SYMBOL: Record<Gender, string> = { female: '♀', male: '♂', '': '?' }

// Round badge with the gender symbol, used wherever visitors are placed with hosts.
export default function GenderMark({ gender }: { gender: Gender }) {
  return (
    <span className={`gender gender-${gender || 'unknown'}`} title={GENDER_LABEL[gender]} aria-label={GENDER_LABEL[gender]}>
      {SYMBOL[gender]}
    </span>
  )
}
