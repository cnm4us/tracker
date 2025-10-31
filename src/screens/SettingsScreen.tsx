import { useState } from 'react'
import type { User } from '../api'
import sound from '../sound'

const btnStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 8,
  border: 'none',
  fontSize: 16,
  minWidth: 96,
}

export default function SettingsScreen(props: { user: User, onSave: (tz:string, recentScope: 'wtd'|'wtd_prev'|'mtd'|'mtd_prev', searchRange: 'wtd'|'wtd_prev'|'prev_week'|'all_weeks'|'mtd'|'mtd_prev'|'prev_month'|'all_months'|'all_records')=>Promise<void> }) {
  const [tz, setTz] = useState<string>(props.user.tz || Intl.DateTimeFormat().resolvedOptions().timeZone)
  const tzList = (Intl as any).supportedValuesOf ? (Intl as any).supportedValuesOf('timeZone') as string[] : [tz]
  const [saving, setSaving] = useState(false)
  const [sounds, setSounds] = useState<boolean>(() => sound.isEnabled())
  const [recentScope, setRecentScope] = useState<'wtd'|'wtd_prev'|'mtd'|'mtd_prev'>(props.user.recent_logs_scope || 'wtd_prev')
  const [searchRange, setSearchRange] = useState<'wtd'|'wtd_prev'|'prev_week'|'all_weeks'|'mtd'|'mtd_prev'|'prev_month'|'all_months'|'all_records'>(props.user.search_default_range || 'wtd_prev')
  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ display:'block', fontSize: 18, color: '#fff', marginBottom: 6 }}>Time Zone</label>
      <select
        value={tz}
        onChange={e=>setTz(e.target.value)}
        style={{
          width: '100%',
          maxWidth: '100%',
          padding: 12,
          border: '1px solid #ccc',
          borderRadius: 8,
          marginBottom: 12,
          fontSize: 18,
          minHeight: 44,
          boxSizing: 'border-box',
          color: '#ffb616',
        }}
      >
        {tzList.map((z) => <option key={z} value={z}>{z}</option>)}
      </select>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 16px' }}>
        <input className="brand" id="sounds" type="checkbox" checked={sounds} onChange={(e)=>{ setSounds(e.target.checked); sound.setEnabled(e.target.checked) }} />
        <label htmlFor="sounds">Button Sounds</label>
      </div>

      <div style={{ margin: '12px 0' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Recent Logs</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
          <label><input type="radio" name="recent_scope" checked={recentScope==='wtd'} onChange={()=>setRecentScope('wtd')} /> WTD: Current Week Only</label>
          <label><input type="radio" name="recent_scope" checked={recentScope==='wtd_prev'} onChange={()=>setRecentScope('wtd_prev')} /> WTD and Previous Week</label>
          <label><input type="radio" name="recent_scope" checked={recentScope==='mtd'} onChange={()=>setRecentScope('mtd')} /> MTD: Current Month Only</label>
          <label><input type="radio" name="recent_scope" checked={recentScope==='mtd_prev'} onChange={()=>setRecentScope('mtd_prev')} /> MTD and Previous Completed Month</label>
        </div>
      </div>

      <div style={{ margin: '12px 0' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Log Search Defaults</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
          <label><input type="radio" name="search_range" checked={searchRange==='wtd'} onChange={()=>setSearchRange('wtd')} /> WTD: Current Week Only</label>
          <label><input type="radio" name="search_range" checked={searchRange==='wtd_prev'} onChange={()=>setSearchRange('wtd_prev')} /> WTD and Previous Completed Week</label>
          <label><input type="radio" name="search_range" checked={searchRange==='prev_week'} onChange={()=>setSearchRange('prev_week')} /> Previous Completed Week</label>
          <label><input type="radio" name="search_range" checked={searchRange==='all_weeks'} onChange={()=>setSearchRange('all_weeks')} /> All Completed Weeks</label>
          <label><input type="radio" name="search_range" checked={searchRange==='mtd'} onChange={()=>setSearchRange('mtd')} /> MTD: Current Month Only</label>
          <label><input type="radio" name="search_range" checked={searchRange==='mtd_prev'} onChange={()=>setSearchRange('mtd_prev')} /> MTD and Previous Completed Month</label>
          <label><input type="radio" name="search_range" checked={searchRange==='prev_month'} onChange={()=>setSearchRange('prev_month')} /> Previous Completed Month</label>
          <label><input type="radio" name="search_range" checked={searchRange==='all_months'} onChange={()=>setSearchRange('all_months')} /> All Completed Months</label>
          <label><input type="radio" name="search_range" checked={searchRange==='all_records'} onChange={()=>setSearchRange('all_records')} /> All Records</label>
        </div>
      </div>

      <button
        disabled={saving}
        onClick={async()=>{ setSaving(true); try { await sound.enable(); sound.playStart(); await props.onSave(tz, recentScope, searchRange) } finally { setSaving(false) } }}
        className="btn3d btn-glass"
        style={{ ...btnStyle, color: '#fff', width: '100%', ['--btn-color' as any]: '#2e7d32' }}
      >
        Save
      </button>
    </div>
  )
}

