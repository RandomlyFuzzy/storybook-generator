#!/usr/bin/env node
// Default stats API URL for image generation completion timing
export const STATS_API_URL = "https://stats.freegen.app";
// Default WebSocket URL for image generation job updates
export const WEBSOCKET_URL = "wss://websocket-bridge.freegen.app/ws";
// Default generator URL for image generation
export const GENERATOR_URL = "https://image-generator.freegen.app/";
// Default signer URL for image generation
export const SIGNER_URL = "https://prompt-signer.freegen.app/";
import fs from 'fs'
import path from 'path'


import fetch from 'node-fetch'
import WebSocket from 'ws'
import crypto from 'crypto'

/**
 * Enum for supported aspect ratios.
 */
export const AspectRatio = Object.freeze({
  SQUARE: '1:1',
  PORTRAIT: '3:4',
  LANDSCAPE: '4:3',
  WIDESCREEN: '16:9',
  TALL: '9:16',
})

/**
 * Placeholder class for image generation.
 */
export class ImageGenerator {
  async generateRemoteImage({
    prompt,
    aspectRatio,
    imageBase64,
    outputFile
  }) {

    if (!prompt) throw new Error('Prompt is required');
    if (prompt.length > 2000) throw new Error('Prompt must be less than 2000 characters.');
    if (!aspectRatio) throw new Error('Aspect ratio is required');
    // Validate aspectRatio is in AspectRatio enum
    if (!Object.values(AspectRatio).includes(aspectRatio)) {
      throw new Error(`Invalid aspect ratio: ${aspectRatio}. Must be one of: ${Object.values(AspectRatio).join(', ')}`);
    }

    const startTime = Date.now();

    // Get signature
    const signerRes = await fetch(SIGNER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!signerRes.ok) {
      throw new Error(`Signer Error (${signerRes.status})`);
    }

    const { ts, sig } = await signerRes.json();

    // Generate image
    const generatorRes = await fetch(GENERATOR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        ts,
        sig,
        ratio_id: aspectRatio,
        ...(imageBase64 && { image_data: imageBase64 })
      })
    });

    const data = await generatorRes.json().catch(() => ({}));

    if (!generatorRes.ok) {
      throw new Error(data.error || `Generator Error (${generatorRes.status})`);
    }

    // Direct image response
    if (data.image_data_url) {
      return this.finalizeResult({
        imageUrl: data.image_data_url,
        outputFile,
        jobId: `fallback_${Date.now()}`,
        startTime
      });
    }

    // WebSocket job queue
    if (!data.job_id) {
      throw new Error('Failed to generate image.');
    }

    return this.waitForJob({
      jobId: data.job_id,
      outputFile,
      startTime
    });
  }

  async waitForJob({ jobId, outputFile, startTime }) {
    const auth = await this.createWebSocketAuth(jobId);

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WEBSOCKET_URL);

      const cleanup = () => {
        clearTimeout(timeout);
        ws.close();
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('WebSocket timeout'));
      }, 300000);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'subscribe',
          job_id: jobId,
          auth
        }));
      });

      ws.on('message', async (msg) => {
        try {
          const message = JSON.parse(msg);

          if (message.type === 'error') {
            cleanup();
            return reject(
              new Error(message.message || 'Failed to generate image.')
            );
          }

          if (message.type === 'result' && message.image_data) {
            cleanup();

            try {
              const result = await this.finalizeResult({
                imageUrl: message.image_data,
                outputFile,
                jobId,
                startTime
              });

              resolve(result);
            } catch (err) {
              reject(err);
            }
          }
        } catch {}
      });

      ws.on('error', (err) => {
        cleanup();
        reject(new Error(`WebSocket error: ${err.message}`));
      });

      ws.on('close', () => clearTimeout(timeout));
    });
  }


  async finalizeResult({ imageUrl, outputFile, jobId, startTime }) {
    let imagePath;
    let outFile = outputFile;
    // Always save as .jpg
    if (outFile && !outFile.toLowerCase().endsWith('.jpg')) {
      outFile = outFile.replace(/\.[^/.]+$/, '') + '.jpg';
    }
    if (outFile) {
      await downloadImage(imageUrl, outFile);
      imagePath = outFile;
    }

    fetch(`${STATS_API_URL}/record-completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        total_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString()
      })
    }).catch(() => {});

    return {
      imageUrl,
      imagePath,
      jobId
    };
  }

  async createWebSocketAuth(jobId) {
    const timestamp = Math.floor(Date.now() / 1000);

    const hash = crypto
      .createHash('sha256')
      .update(jobId + timestamp)
      .digest('base64url');

    return `${hash.slice(0, 20)}:${timestamp}`;
  }
}

/**
 * Download an image from a URL and save to file.
 * @param {string} url
 * @param {string} dest
 */
async function downloadImage(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch image');
  const stream = fs.createWriteStream(dest);
  await new Promise((resolve, reject) => {
    res.body.pipe(stream);
    res.body.on('error', reject);
    stream.on('finish', resolve);
  });
}
