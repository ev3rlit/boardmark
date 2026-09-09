import { useEffect, useRef, useState } from 'react'
import type { BuiltInImageResolver } from '@boardmark/canvas-domain'

type ImageValues = { src: string; alt: string; title: string }
export function ImageInputDialog({ initial, metadataOnly = false, imageResolver, onSubmit, onClose }: {
  initial?: ImageValues
  metadataOnly?: boolean
  imageResolver?: BuiltInImageResolver
  onSubmit: (values: ImageValues) => Promise<void>
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [values, setValues] = useState<ImageValues>(initial ?? { src: '', alt: '', title: '' })
  const [decorative, setDecorative] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<string>()
  useEffect(() => {
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.current?.showModal()
    return () => focus?.focus()
  }, [])
  useEffect(() => {
    let active = true
    setPreview(undefined)
    setError('')
    const timer = setTimeout(() => {
      if (!values.src.trim()) return
      if (/^https?:\/\//.test(values.src)) { setPreview(values.src); return }
      if (imageResolver) void imageResolver(values.src).then(result => {
        if (!active) return
        if (result.status === 'resolved') setPreview(result.src)
        else setError(result.message)
      }).catch(error => { if (active) setError(String(error)) })
    }, 150)
    return () => { active = false; clearTimeout(timer) }
  }, [values.src, imageResolver])
  return <dialog ref={dialog} className="viewer-image-dialog" onCancel={event => { event.preventDefault(); if (!busy) onClose() }} aria-labelledby="image-input-title">
    <form onSubmit={event => {
      event.preventDefault()
      if (!decorative && !values.alt.trim()) { setError('이미지 설명을 입력하거나 장식용 이미지로 표시하세요.'); return }
      if (!metadataOnly && !/^(https?:\/\/\S+|asset:[a-f0-9]{64}|[^:\s]+)$/.test(values.src.trim())) { setError('https URL 또는 문서 첨부 경로를 입력하세요.'); return }
      setBusy(true); setError('')
      void onSubmit({ ...values, src: values.src.trim(), alt: decorative ? '' : values.alt, title: values.title.trim() })
        .then(onClose).catch(error => setError(error instanceof Error ? error.message : String(error))).finally(() => setBusy(false))
    }}>
      <h2 id="image-input-title">{metadataOnly ? '이미지 설명 편집' : '이미지 추가'}</h2>
      {!metadataOnly && <label>이미지 URL 또는 첨부 경로<input autoFocus value={values.src} onChange={event => setValues({ ...values, src: event.target.value })} required /></label>}
      {preview && <div className="viewer-image-preview"><img src={preview} alt={values.alt || '이미지 미리보기'} onError={() => setError('미리보기를 불러올 수 없습니다. 주소를 확인하세요.')} /></div>}
      <label>이미지 설명<input autoFocus={metadataOnly} value={values.alt} onChange={event => setValues({ ...values, alt: event.target.value })} disabled={decorative} /></label>
      <label className="viewer-image-checkbox"><input type="checkbox" checked={decorative} onChange={event => setDecorative(event.target.checked)} />의미 전달 없이 장식에만 쓰는 이미지</label>
      {!metadataOnly && <label>제목 (선택)<input value={values.title} onChange={event => setValues({ ...values, title: event.target.value })} /></label>}
      {error && <p role="alert">{error}</p>}
      <div className="viewer-image-actions"><button type="button" onClick={onClose} disabled={busy}>취소</button><button type="submit" disabled={busy}>{busy ? '반영 중…' : metadataOnly ? '설명 적용' : '이미지 추가'}</button></div>
    </form>
  </dialog>
}
