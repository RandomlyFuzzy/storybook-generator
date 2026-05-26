#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'


const __dirname = path.dirname(fileURLToPath(import.meta.url))

const reviewSchema = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../schemas/review.schema.json'),
    'utf-8'
  )
)

const args = process.argv.slice(2)

const model = args.includes('--model')
  ? args[args.indexOf('--model') + 1]
  : 'gemma4:e2b-128k'

const approvedDir = args.includes('--approved-dir')
  ? args[args.indexOf('--approved-dir') + 1]
  : path.join(__dirname, '../output/autoReviewed')

const rejectedDir = args.includes('--rejected-dir')
  ? args[args.indexOf('--rejected-dir') + 1]
  : path.join(__dirname, '../output/NEEDSAutoReview')

const target = args.find(a => !a.startsWith('--')) || '.'

const file = fs.statSync(target).isDirectory()
  ? fs.readdirSync(target)
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(target, f))
  : [target]

function buildPrompt(story) {
  const age = story.target_age || []

  return [
    `You are a children's book editor. Review this story as if it is intended for children.`,
    `- Use gentle, positive, and age-appropriate language in your review.`,
    `- Focus on imagination, kindness, positive morals, and emotional safety.`,
    `- Flag any content that may be too complex, scary, or inappropriate for children.`,
    `- Highlight positive themes, learning opportunities, and encouragement.`,
    `- Return ONLY valid JSON matching the schema below. No markdown, no explanation — just the JSON object.`,
    ``,
    `REVIEW SCHEMA:`,
    JSON.stringify(reviewSchema, null, 2),
    ``,
    `STORY TO REVIEW:`,
    `Title: ${story.front_cover?.title || 'Untitled'}`,
    `Theme: ${story.theme || 'None'}`,
    `Target age: ${
      age.length === 2
        ? `${age[0]}-${age[1]} years`
        : 'Not specified'
    }`,
    ``,
    `PAGES:`,
    ...story.pages.map(
      (p, i) => `Page ${p.page || i + 1}: ${p.text || ''}`
    )
  ].join('\n')
}

async function callOllama(prompt) {
  const url = `http://localhost:11434/api/generate?stream=false&model=${encodeURIComponent(model)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  const data = await res.json()
  return data.response || ''
}

function stripANSI(s) {
  return s.replace(/\x1B\[[\d;]*[A-Za-z]/g, '').replace(/\x1B\[K/g, '')
}

function extractJSON(text) {
  let s = stripANSI(String(text))
  s = s.replace(/^\s*```(?:\s*\w+)?\s*/g, '')
  s = s.replace(/\s*```\s*$/g, '')
  s = s.trim()

  try {
    return JSON.parse(s)
  } catch {}

  const match = s.match(/\{[\s\S]*\}/)

  if (!match) return null

  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

function isShorttext(sub) {
  if (!sub || typeof sub !== 'string') return true

  return sub.trim().split(/\s+/).length < 6
}

for (const f of file) {
  const name = path.basename(f, '.json')

  console.log(`\n=== Reviewing ${name} ===`)

  let story

  try {
    story = JSON.parse(fs.readFileSync(f, 'utf-8'))
  } catch {
    console.log(`  Cannot parse — skipping`)
    continue
  }

  if (!story.pages?.length) {
    console.log(`  No pages — skipping`)
    continue
  }

  // text validation
  let textIssues = []

  if (
    story.front_cover &&
    isShorttext(story.front_cover.text)
  ) {
    textIssues.push(
      `Front cover text is too short: "${story.front_cover.text}"`
    )
  }

  for (const [i, p] of story.pages.entries()) {
    if (isShorttext(p.text)) {
      textIssues.push(
        `Page ${p.page ?? i + 1} text is too short: "${p.text}"`
      )
    }
  }

  let review = null
  let raw = null

  if (textIssues.length > 0) {
    review = {
      title: story.front_cover?.title || 'Untitled',
      age_group_suitable: false,
      age_group_notes: 'text(s) too short for main pages.',
      coherent_story: false,
      coherent_notes: 'text(s) too short for main pages.',
      engagement_score: 3,
      engagement_notes:
        'texts are too brief to engage readers.',
      issues: textIssues,
      suggestions: [
        'Ensure every main page text is a full sentence (at least 6 words).'
      ],
      verdict: 'texts are too short. Needs revision.',
      approved: false
    }

    console.log('  texts too short! Failing review.')
  } else {
    try {
      console.log(`  Sending to ${model}...`)

      const prompt = buildPrompt(story)

      raw = await callOllama(prompt)

      review = extractJSON(raw)
    } catch (err) {
      console.log(`  Ollama error: ${err.message}`)
      continue
    }
  }

  if (!review) {
    console.log(`  Could not extract JSON. Raw output saved.`)

    fs.writeFileSync(
      `review_raw_${Date.now()}.txt`,
      raw || '',
      'utf-8'
    )

    continue
  }

  const status = review.approved
    ? 'APPROVED'
    : 'NEEDS REVISION'

  const stars =
    '\u2605'.repeat(
      Math.round((review.engagement_score || 5) / 2)
    ) +
    '\u2606'.repeat(
      5 - Math.round((review.engagement_score || 5) / 2)
    )

  console.log(`  Title:       ${review.title}`)
  console.log(`  Status:      ${status}`)
  console.log(`  Verdict:     ${review.verdict}`)
  console.log(
    `  Age group:   ${
      review.age_group_suitable
        ? '\u2713 Suitable'
        : '\u2717 Issues'
    } — ${review.age_group_notes}`
  )

  console.log(
    `  Coherence:   ${
      review.coherent_story
        ? '\u2713 Coherent'
        : '\u2717 Problems'
    } — ${review.coherent_notes}`
  )

  console.log(
    `  Engagement:  ${review.engagement_score}/10 ${stars} — ${review.engagement_notes}`
  )

  if (review.issues?.length) {
    console.log(`  Issues:`)

    for (const i of review.issues) {
      console.log(`    - ${i}`)
    }
  }

  if (review.suggestions?.length) {
    console.log(`  Suggestions:`)

    for (const s of review.suggestions) {
      console.log(`    - ${s}`)
    }
  }

  const relPath = path.relative(target, f)
  let relDir = path.dirname(relPath)
  const baseName = path.basename(f, '.json')

  // Strip well-known output/ prefix when relDir includes the full
  // project-relative path (e.g. when target is '.' rather than a specific directory)
  if (relDir.startsWith('output' + path.sep)) {
    const parts = relDir.split(path.sep)
    relDir = parts.slice(2).join(path.sep) || '.'
  }

  const reviewDir = path.join(
    __dirname,
    '../output/autoReview',
    relDir
  )

  fs.mkdirSync(reviewDir, { recursive: true })

  const reviewFile = path.join(
    reviewDir,
    `Review_${baseName}.json`
  )

  fs.writeFileSync(
    reviewFile,
    JSON.stringify(review, null, 2),
    'utf-8'
  )

  console.log(`  Review saved to ${reviewFile}`)

  if (approvedDir || rejectedDir) {
    let destDir

    if (review.approved && approvedDir) {
      destDir = path.join(
        approvedDir,
        relDir === '.' ? '' : relDir
      )
    } else if (!review.approved && rejectedDir) {
      destDir = path.join(
        rejectedDir,
        relDir === '.' ? '' : relDir
      )
    }

    if (destDir) {
      fs.mkdirSync(destDir, { recursive: true })

      const destFile = path.join(
        destDir,
        path.basename(f)
      )

      fs.renameSync(f, destFile)

      console.log(`  Story moved to ${destFile}`)
    }
  }
}