import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OpenApiBlock } from './openapi-block'
import { MarkdownContent } from './markdown-content'

const source = JSON.stringify({ openapi: '3.1.1', info: { title: 'Pets API', version: '1' }, paths: { '/pets': { get: { summary: '목록 조회', responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'string' } } } } } }, post: { responses: { '201': { description: 'Created' } } } } } })

describe('OpenApiBlock', () => {
  it('loads through the fenced registry and filters stable endpoint identities', async () => {
    const { container } = render(<MarkdownContent content={'```openapi\n' + source + '\n```'} />)
    expect(await screen.findByRole('heading', { name: 'Pets API' })).toBeVisible()
    expect(container.querySelector('[data-operation-key="GET /pets"]')).not.toBeNull()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'post' } })
    expect(container.querySelector('[data-operation-key="GET /pets"]')).toBeNull()
    expect(container.querySelector('[data-operation-key="POST /pets"]')).not.toBeNull()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'unknown' } })
    expect(screen.getByText('검색 결과가 없습니다.')).toBeVisible()
  })

  it('shows local error and original source, then recovers on edit', () => {
    const { rerender } = render(<OpenApiBlock source="openapi: [" />)
    expect(screen.getByRole('alert')).toHaveTextContent('원본을 수정')
    expect(screen.getByText('openapi: [')).toBeInTheDocument()
    rerender(<OpenApiBlock source={source} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Pets API' })).toBeVisible()
  })

  it('renders descriptions as text instead of executable HTML', () => {
    const { container } = render(<OpenApiBlock source={source.replace('목록 조회', '<img src=x onerror=alert(1)>')} />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
  })
})
