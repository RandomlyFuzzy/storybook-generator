#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

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
  : 'gemma4:e2b'

const approvedDir = args.includes('--approved-dir')
  ? args[args.indexOf('--approved-dir') + 1]
  : null

const rejectedDir = args.includes('--rejected-dir')
  ? args[args.indexOf('--rejected-dir') + 1]
  : null

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
      (p, i) => `Page ${p.page || i + 1}: ${p.subtitle || ''}`
    )
  ].join('\n')
}

function callOllama(prompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ollama', ['run', model])

    let output = ''
    let error = ''

    proc.stdout.on('data', d => {
      output += d.toString()
    })

    proc.stderr.on('data', d => {
      error += d.toString()
    })

    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(error || `Ollama exited with ${code}`))
      } else {
        resolve(output)
      }
    })

    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

function extractJSON(text) {
  try {
    return JSON.parse(text)
  } catch {}

  const match = text.match(/\{[\s\S]*\}/)

  if (!match) return null

  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

function isShortSubtitle(sub) {
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

  // subtitle validation
  let subtitleIssues = []

  if (
    story.front_cover &&
    isShortSubtitle(story.front_cover.subtitle)
  ) {
    subtitleIssues.push(
      `Front cover subtitle is too short: "${story.front_cover.subtitle}"`
    )
  }

  for (const [i, p] of story.pages.entries()) {
    if (isShortSubtitle(p.subtitle)) {
      subtitleIssues.push(
        `Page ${p.page ?? i + 1} subtitle is too short: "${p.subtitle}"`
      )
    }
  }

  let review = null
  let raw = null

  if (subtitleIssues.length > 0) {
    review = {
      title: story.front_cover?.title || 'Untitled',
      age_group_suitable: false,
      age_group_notes: 'Subtitle(s) too short for main pages.',
      coherent_story: false,
      coherent_notes: 'Subtitle(s) too short for main pages.',
      engagement_score: 3,
      engagement_notes:
        'Subtitles are too brief to engage readers.',
      issues: subtitleIssues,
      suggestions: [
        'Ensure every main page subtitle is a full sentence (at least 6 words).'
      ],
      verdict: 'Subtitles are too short. Needs revision.',
      approved: false
    }

    console.log('  Subtitles too short! Failing review.')
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
  const relDir = path.dirname(relPath)
  const baseName = path.basename(f, '.json')

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
        path.dirname(relPath)
      )
    } else if (!review.approved && rejectedDir) {
      destDir = path.join(
        rejectedDir,
        path.dirname(relPath)
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