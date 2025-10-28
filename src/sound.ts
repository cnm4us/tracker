let ctx: AudioContext | null = null
let unlocked = false
let enabled = true

const LS_KEY = 'button_sounds'

function readEnabled() {
  try {
    const v = localStorage.getItem(LS_KEY)
    if (v === null) return true
    return v === '1'
  } catch {
    return true
  }
}

function writeEnabled(v: boolean) {
  try { localStorage.setItem(LS_KEY, v ? '1' : '0') } catch {}
}

enabled = readEnabled()

async function ensureContext() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)() } catch { return null }
  }
  if (ctx.state === 'suspended') {
    try { await ctx.resume() } catch {}
  }
  unlocked = true
  return ctx
}

function playClick(durationMs = 35, gain = 0.06, highpassHz = 1200) {
  if (!enabled || !ctx) return
  const sr = ctx.sampleRate
  const length = Math.max(1, Math.floor((durationMs / 1000) * sr))
  const buffer = ctx.createBuffer(1, length, sr)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * 0.6

  const src = ctx.createBufferSource()
  src.buffer = buffer

  const filter = ctx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = highpassHz
  filter.Q.value = 0.7

  const g = ctx.createGain()
  const now = ctx.currentTime
  // Quick attack then fast decay to emulate a click
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(gain, now + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)

  src.connect(filter).connect(g).connect(ctx.destination)
  src.start(now)
  src.stop(now + durationMs / 1000 + 0.01)
}

export const sound = {
  enable: async () => { await ensureContext() },
  isUnlocked: () => unlocked,
  isEnabled: () => enabled,
  setEnabled: (v: boolean) => { enabled = v; writeEnabled(v) },
  // Short percussive clicks (different feel per action)
  playStart: () => { if (ctx) playClick(30, 0.06, 1600) },
  playStop: () => { if (ctx) playClick(45, 0.07, 1000) },
  playNew: () => { if (ctx) playClick(25, 0.05, 1400) },
}

export default sound
