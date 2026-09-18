import { useMemo, useState } from 'react'
import { parseOpenApi, type ApiDetail } from '../lib/openapi-document'
import './openapi-block.css'

export function OpenApiBlock({ source }: { source: string }) {
  const result = useMemo(() => parseOpenApi(source), [source])
  const [query, setQuery] = useState('')
  const operations = result.status === 'ready'
    ? result.document.operations.filter((operation) => `${operation.key} ${operation.summary} ${operation.operationId ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    : []

  return (
    <section
      aria-label="OpenAPI 문서"
      className="openapi-block nodrag nopan nowheel"
      data-state={result.status}
      contentEditable={false}
      onDoubleClick={(event) => {
        if (event.target instanceof Element && event.target.closest('summary, input, button')) event.stopPropagation()
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {result.status === 'error' ? (
        <div role="alert">
          <h3>OpenAPI 명세를 읽을 수 없습니다</h3>
          <p>{result.message}</p>
          <p>노트 편집에서 원본을 수정해 주세요. 입력한 내용은 보존됩니다.</p>
        </div>
      ) : (
        <>
          <header>
            <span className="openapi-block__eyebrow">OPENAPI {result.document.openapi} · {result.document.version}</span>
            <h3>{result.document.title}</h3>
            {result.document.description && <p>{result.document.description}</p>}
          </header>
          {result.document.warnings.length > 0 && (
            <aside aria-label="지원 범위 안내">{result.document.warnings.map((warning) => <p key={warning}>{warning}</p>)}</aside>
          )}
          <label className="openapi-block__search">
            <span>엔드포인트 검색 · {result.document.operations.length}개</span>
            <input
              type="search"
              placeholder="경로, 메서드, 설명 검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="openapi-block__operations">
            {operations.map((operation) => (
              <details className="openapi-block__operation" key={operation.key} data-operation-key={operation.key}>
                <summary>
                  <span className="openapi-block__method">{operation.method}</span>
                  <code>{operation.path}</code>
                  {operation.summary && <span className="openapi-block__summary">{operation.summary}</span>}
                </summary>
                <div className="openapi-block__body">
                  {operation.description && <p>{operation.description}</p>}
                  {operation.operationId && <p>operationId: <code>{operation.operationId}</code></p>}
                  <h4>파라미터</h4>
                  {operation.parameters.length ? operation.parameters.map((detail) => <Detail key={detail.label} detail={detail} />) : <p>파라미터 없음</p>}
                  <h4>요청 본문</h4>
                  {operation.requestBody ? <Detail detail={operation.requestBody} /> : <p>요청 본문 없음</p>}
                  <h4>응답</h4>
                  {operation.responses.map((detail) => <Detail key={detail.label} detail={detail} />)}
                </div>
              </details>
            ))}
            {result.document.operations.length === 0 && <p>표시할 엔드포인트가 없습니다. paths에 HTTP 메서드를 작성해 주세요.</p>}
            {result.document.operations.length > 0 && operations.length === 0 && <p>검색 결과가 없습니다.</p>}
          </div>
        </>
      )}
      <details className="openapi-block__source">
        <summary>OpenAPI 원본 보기</summary>
        <pre><code>{source}</code></pre>
      </details>
    </section>
  )
}

function Detail({ detail }: { detail: ApiDetail }) {
  const [open, setOpen] = useState(false)
  if (detail.children.length === 0) {
    return <div className="openapi-block__value"><strong>{detail.label}</strong><span>{detail.value || '""'}</span></div>
  }
  return (
    <details className="openapi-block__detail" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{detail.label}{detail.value && <span> · {detail.value}</span>}</summary>
      {open && <div>{detail.children.map((child) => <Detail key={child.label} detail={child} />)}</div>}
    </details>
  )
}
