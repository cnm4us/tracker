#!/usr/bin/env tsx
import { localDateTimeToUTCISO } from '../../src/time'

function check(label: string, tz: string, ymd: string, hhmm: string, expect: string) {
  const out = localDateTimeToUTCISO(ymd, hhmm, tz)
  const ok = out === expect
  console.log(`${ok ? 'OK ' : 'ERR'} ${label} tz=${tz} ${ymd} ${hhmm} -> ${out} ${ok ? '' : `(expected ${expect})`}`)
  if (!ok) process.exitCode = 1
}

// Test cases around typical zones
check('LA (DST)', 'America/Los_Angeles', '2025-10-29', '21:31', '2025-10-30T04:31:00.000Z') // PDT (UTC-7)
check('NY (DST)', 'America/New_York',   '2025-10-29', '21:31', '2025-10-30T01:31:00.000Z') // EDT (UTC-4)
check('Kolkata',  'Asia/Kolkata',       '2025-10-29', '21:31', '2025-10-29T16:01:00.000Z') // IST (UTC+5:30)

// A quick check near DST fall transition for LA 2025 (fallback Nov 2, 2025 at 02:00 local)
check('LA pre-fall DST', 'America/Los_Angeles', '2025-11-01', '23:30', '2025-11-02T06:30:00.000Z') // still PDT
check('LA post-fall DST', 'America/Los_Angeles', '2025-11-02', '03:30', '2025-11-02T11:30:00.000Z') // PST (UTC-8)

