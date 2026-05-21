import fs from 'fs'
import { Tool, OllamaAgent } from './ollama.mjs'

const weatherTool = new Tool({
  name: 'getWeather',

  description: 'Get weather for a city',

  parameters: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
      },
    },
    required: ['city'],
  },

  async execute({ city }) {
    return {
      city,
      temperature: 14,
      condition: 'Rainy',
    }
  },
})

const plantTool = new Tool({
  name: 'getPlantCare',

  description: 'Get plant care instructions',

  parameters: {
    type: 'object',
    properties: {
      plant: {
        type: 'string',
      },
    },
    required: ['plant'],
  },

  async execute({ plant }) {
    return {
      plant,
      water: 'Twice weekly',
      sunlight: 'Indirect light',
    }
  },
})

const agent = new OllamaAgent({
  model: 'gemma4:e2b',

  system: `
You are a helpful assistant.
Use tools whenever needed.
`,

  tools: [
    weatherTool,
    plantTool,
  ],
})

const result = await agent.chat({
  prompt:
    'Look at this image and tell me how to care for the plant.',

  images: [
    './flower.webp',
  ],
})

console.log('\n\nFINAL ANSWER:\n')
console.log(result)