export type SandpackBlockPayload = {
  meta?: string
  source: string
}

const sandpackBlockPayloads = new WeakMap<HTMLElement, SandpackBlockPayload>()

export function registerSandpackBlockPayload(
  element: HTMLElement,
  payload: SandpackBlockPayload
) {
  sandpackBlockPayloads.set(element, payload)
}

export function unregisterSandpackBlockPayload(element: HTMLElement) {
  sandpackBlockPayloads.delete(element)
}

export function readSandpackBlockPayload(element: HTMLElement) {
  return sandpackBlockPayloads.get(element) ?? null
}
