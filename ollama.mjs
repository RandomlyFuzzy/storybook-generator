import ollama from 'ollama'
import fs from 'fs'

/**
 * Small reusable tool object
 */
class Tool {
  constructor({ name, description, parameters, execute }) {
    this.name = name
    this.description = description
    this.parameters = parameters
    this.execute = execute
  }

  toJSON() {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    }
  }
}

/**
 * Ollama agent wrapper
 */
class OllamaAgent {
  constructor({
    model = 'qwen2.5vl',
    system = '',
    tools = [],
  } = {}) {
    this.model = model
    this.messages = []

    this.toolMap = new Map()

    if (system) {
      this.messages.push({
        role: 'system',
        content: system,
      })
    }

    for (const tool of tools) {
      this.addTool(tool)
    }
  }

  addTool(tool) {
    this.toolMap.set(tool.name, tool)
  }

  getToolDefinitions() {
    return [...this.toolMap.values()].map((t) => t.toJSON())
  }

  async chat({
    prompt,
    images = [],
    stream = false,
  }) {
    const message = {
      role: 'user',
      content: prompt,
    }

    if (images.length) {
      message.images = images.map((img) => {
        if (Buffer.isBuffer(img)) {
          return img.toString('base64')
        }

        if (fs.existsSync(img)) {
          return fs.readFileSync(img).toString('base64')
        }

        return img
      })
    }

    this.messages.push(message)

    const response = await ollama.chat({
      model: this.model,
      messages: this.messages,
      tools: this.getToolDefinitions(),
      stream,
    })

    // streaming mode
    if (stream) {
      let final = ''

      for await (const chunk of response) {
        const content = chunk.message?.content || ''
        process.stdout.write(content)
        final += content
      }

      return final
    }

    const msg = response.message

    this.messages.push(msg)

    // handle tool calls
    if (msg.tool_calls?.length) {
      for (const call of msg.tool_calls) {
        const toolName = call.function.name
        const args = call.function.arguments

        const tool = this.toolMap.get(toolName)

        if (!tool) continue

        const result = await tool.execute(args)

        this.messages.push({
          role: 'tool',
          name: toolName,
          content: JSON.stringify(result),
        })
      }

      // ask model again with tool results
      const finalResponse = await ollama.chat({
        model: this.model,
        messages: this.messages,
      })

      this.messages.push(finalResponse.message)

      return finalResponse.message.content
    }

    return msg.content
  }
}

export { Tool, OllamaAgent }