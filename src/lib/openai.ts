import { env, SYSTEM_PROMPT } from '../config'
import type { AskHandlers, Msg } from './anthropic'

export async function askOpenAI(
  provider: 'openai' | 'nvidia',
  history: Msg[],
  handlers: AskHandlers,
): Promise<{ text: string; tools: string[] }> {
  const isNvidia = provider === 'nvidia'
  const apiKey = isNvidia ? env.nvidiaKey : env.openaiKey
  const model = isNvidia ? env.nvidiaModel : env.openaiModel
  const baseUrl = isNvidia
    ? 'https://integrate.api.nvidia.com/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions'

  if (!apiKey) {
    const msg = `No API key configured for ${provider.toUpperCase()} mode.`
    handlers.onText(msg)
    return { text: msg, tools: [] }
  }

  // Convert messages to standard OpenAI format
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    })),
  ]

  let responseText = ''

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      const msg = `API Error (${response.status}): ${errText}`
      handlers.onText('I encountered an error reaching the model, sir.')
      return { text: msg, tools: [] }
    }

    if (!response.body) {
      return { text: '', tools: [] }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue
        if (trimmed === 'data: [DONE]') break

        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6))
            const delta = data.choices?.[0]?.delta?.content
            if (delta) {
              responseText += delta
              handlers.onText(delta)
            }
          } catch {
            // Ignore incomplete SSE frames
          }
        }
      }
    }

    return { text: responseText.trim(), tools: [] }
  } catch (err: any) {
    const msg = `Error: ${err?.message ?? err}`
    handlers.onText('I am unable to process the request right now, sir.')
    return { text: msg, tools: [] }
  }
}
