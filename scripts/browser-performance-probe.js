(() => {
  let phase = null
  let last = 0
  const observer = new PerformanceObserver(list => {
    if (!phase) return
    for (const entry of list.getEntries()) if (entry.startTime >= phase.started) phase.events.push({ name: entry.name, duration: entry.duration })
  })
  observer.observe({ type: 'event', buffered: false, durationThreshold: 16 })
  const frame = now => {
    if (phase && last) phase.frames.push(now - last)
    last = now
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  for (const event of ['pointerdown', 'keydown']) document.addEventListener(event, input => {
    const current = phase
    if (current) requestAnimationFrame(() => current.input.push({ name: event, nextFrameMs: performance.now() - input.timeStamp }))
  }, { capture: true })
  window.boardmarkPerformanceProbe = {
    start(name) { phase = { name, started: performance.now(), frames: [], events: [], input: [] }; last = 0 },
    stop() {
      const result = phase
      phase = null
      if (!result) return null
      const ordered = result.frames.sort((a, b) => a - b)
      return { name: result.name, durationMs: performance.now() - result.started, frames: ordered.length,
        frameP95Ms: ordered[Math.floor(ordered.length * .95)] ?? null, frameMaxMs: ordered.at(-1) ?? null,
        framesOver33Ms: ordered.filter(value => value > 33).length, events: result.events, input: result.input }
    }
  }
  return '브라우저 진단 준비'
})()
