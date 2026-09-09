import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, writeFileSync } from 'node:fs'

const executable = process.env.BOARDMARK_BROWSER_CLI
if (!executable) throw new Error('BOARDMARK_BROWSER_CLI에 agent-browser 실행 파일 경로를 지정하세요.')
const run = async (...args) => (await promisify(execFile)(executable, ['--session', 'boardmark-perf', ...args], { maxBuffer: 4_000_000, timeout: 60_000 })).stdout.trim()
const clickButton = name => run('find', 'role', 'button', 'click', '--name', name, '--exact')
await run('open', 'http://127.0.0.1:5173')
await run('set', 'viewport', '1280', '900')
const snapshot = await run('snapshot', '-i')
if (snapshot.includes('접근 토큰')) {
  await run('find', 'label', '접근 토큰', 'fill', readFileSync('.boardmark/access-token', 'utf8').trim())
  await clickButton('작업 공간 열기')
}
const reports = []
await run('eval', readFileSync('scripts/browser-performance-probe.js', 'utf8'))
for (const name of ['성능 100', '성능 500', '성능 1000', '성능 100 mixed']) {
  await run('eval', `(() => { if (!document.querySelector('.db-library')) document.querySelector('.db-header button').click() })()`)
  await run('eval', `(() => { const button = [...document.querySelectorAll('.db-library li button')].find(b => b.querySelector('span')?.textContent === ${JSON.stringify(name)}); if (!button) throw Error('문서 목록에서 대상을 찾지 못했습니다.'); button.click() })()`)
  await run('eval', 'new Promise(resolve => setTimeout(resolve, 2500))')
  const phases = []
  const nodeId = name.endsWith('mixed') ? 'n2' : 'n0'
  const measure = async (kind, operation) => {
    await run('eval', `window.boardmarkPerformanceProbe.start('${kind}')`)
    await operation()
    phases.push(JSON.parse(await run('eval', 'window.boardmarkPerformanceProbe.stop()')))
  }
  await measure('click-key', async () => {
    await run('dblclick', `.react-flow__node[data-id="${nodeId}"]`)
    await run('wait', `[aria-label="Edit ${nodeId}"]`)
    await run('find', 'role', 'textbox', 'click', '--name', `Edit ${nodeId}`, '--exact')
    await run('press', 'End')
    await run('press', 'x')
    await run('press', 'Backspace')
    await clickButton('편집 완료')
    await run('wait', '--fn', '!document.querySelector("[contenteditable=true]")')
  })
  await measure('drag', async () => {
    const origin = JSON.parse(await run('eval', `(() => {const n=document.querySelector('.react-flow__node[data-id="${nodeId}"]');const r=n.getBoundingClientRect();return {x:r.left+r.width*.8,y:r.bottom-24,left:r.left,top:r.top}})()`))
    await run('mouse', 'move', String(Math.round(origin.x)), String(Math.round(origin.y))); await run('mouse', 'down')
    await run('mouse', 'move', String(Math.round(origin.x + 10)), String(Math.round(origin.y + 5)))
    await run('eval', 'new Promise(resolve => setTimeout(resolve, 200))')
    for (let i = 1; i <= 4; i++) await run('mouse', 'move', String(Math.round(origin.x + 10 + i * 12)), String(Math.round(origin.y + 5 + i * 7)))
    await run('mouse', 'up')
    await run('wait', '--fn', `document.querySelector('.db-document-title [data-state="saved"]') !== null`)
    const moved = JSON.parse(await run('eval', `(() => {const r=document.querySelector('.react-flow__node[data-id="${nodeId}"]').getBoundingClientRect();return {left:r.left,top:r.top}})()`))
    if (Math.abs(moved.left - origin.left) < 10) throw new Error(`${name}: 실제 드래그 이동이 확인되지 않았습니다.`)
  })
  await clickButton('Pan')
  await measure('pan', async () => {
    await run('mouse', 'move', '20', '500'); await run('mouse', 'down')
    for (let i = 1; i <= 5; i++) await run('mouse', 'move', String(20 + i * 15), String(500 + i * 8))
    await run('mouse', 'up')
  })
  await measure('zoom', async () => { for (let i = 0; i < 3; i++) await clickButton('Zoom out') })
  await clickButton('Select')
  const diagnostics = JSON.parse(await run('eval', `({nodes:document.querySelectorAll('.react-flow__node').length, images:[...document.images].map(i=>({loaded:i.complete&&i.naturalWidth>0})), width:innerWidth, height:innerHeight, browser:navigator.userAgent})`))
  reports.push({ name, phases, diagnostics })
  writeFileSync('.boardmark/performance-browser.json', JSON.stringify(reports, null, 2))
  console.log(JSON.stringify({ name, phases }))
}
