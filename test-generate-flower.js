import fs from 'fs';
import path from 'path';
import { ImageGenerator } from './lib/image-generator.mjs';

async function main() {
  // Read flower.webp and convert to base64
  const imagePath = path.resolve('flower.webp');
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');

  // The API expects base64-encoded image data (webp is accepted by the backend)
  const generator = new ImageGenerator();
  try {
    const result = await generator.generateRemoteImage({
      prompt: 'i want a super flower',
      aspectRatio: '1:1',
      imageBase64,
      outputFile: 'super_flower.jpg'
    });
    console.log('Image generated:', result);
  } catch (err) {
    console.error('Error generating image:', err);
  }
}

main();
