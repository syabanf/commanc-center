import { isSuppressed } from '@gpi/fixtures'
import { useStore } from '../state/store'

/** New alarms waiting for acknowledgement, for the nav badges. */
export function useNewAlarmCount(): number {
  return useStore().state.alarms.filter((a) => a.status === 'new' && !isSuppressed(a)).length
}
