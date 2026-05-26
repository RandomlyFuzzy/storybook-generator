import fs from 'fs';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import { StoryPageCompiler } from './lib/story-compiler.mjs';
import { ImageGenerator, AspectRatio } from './lib/image-generator.mjs';


// === CONFIGURATION (with CLI args) ===
// Usage: node StoryToImage.js <storyPath> <title> <rel> <aspectRatio>
const args = process.argv.slice(2);
const reviewedStoryPath = args[0] || './output/autoReviewed/05-21/The_Box_of_Forgotten_Stars.json';
const title = args[1] || 'The Box of Forgotten Stars';
const rel = args[2] || '05-21';
const aspectArg = args[3] || 'LANDSCAPE';
const aspectRatio = AspectRatio[aspectArg.toUpperCase()] || AspectRatio.LANDSCAPE;
const outputDir = path.join('output', 'storyimages', rel, title);
fs.mkdirSync(outputDir, { recursive: true });


const RATE_LIMIT_FILE = path.resolve('story_image_rate_limit.json');
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MIN_WAIT_BETWEEN_IMAGES_MS = 10 * 1000; // 10 seconds

function getRateLimitTimestamps() {
	try {
		const data = fs.readFileSync(RATE_LIMIT_FILE, 'utf8');
		return JSON.parse(data);
	} catch (e) {
		return [];
	}
}

function saveRateLimitTimestamps(timestamps) {
	fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(timestamps), 'utf8');
}

function getCurrentHourStart() {
	const now = new Date();
	now.setMinutes(0, 0, 0);
	return now.getTime();
}

async function enforceRateLimit() {
	const now = Date.now();
	const hourStart = getCurrentHourStart();
	let timestamps = getRateLimitTimestamps();
	// Remove timestamps from previous hours
	timestamps = timestamps.filter(ts => ts >= hourStart);
	// Minimum wait delay logic
	if (timestamps.length > 0) {
		const last = timestamps[timestamps.length - 1];
		const sinceLast = now - last;
		if (sinceLast < MIN_WAIT_BETWEEN_IMAGES_MS) {
			const waitMs = MIN_WAIT_BETWEEN_IMAGES_MS - sinceLast;
			process.stdout.write(`Waiting ${Math.ceil(waitMs / 1000)}s for minimum delay...\r`);
			await countdown(waitMs);
			process.stdout.write(' '.repeat(40) + '\r'); // Clear line
		}
	}
	if (timestamps.length >= RATE_LIMIT_MAX) {
		const nextHour = hourStart + 60 * 60 * 1000;
		const waitMs = nextHour - now;
		await countdown(waitMs, 'Rate limit exceeded. Next hour in');
		throw new Error(`Rate limit exceeded: 100 images/hour. Try again in ${Math.ceil(waitMs / 60000)} minute(s).`);
	}
	// Add current timestamp and save
	timestamps.push(Date.now());
	saveRateLimitTimestamps(timestamps);
}

function countdown(ms, prefix = 'Waiting') {
	return new Promise(resolve => {
		let remaining = Math.ceil(ms / 1000);
		const interval = setInterval(() => {
			process.stdout.write(`${prefix} ${remaining}s...\r`);
			remaining--;
			if (remaining < 0) {
				clearInterval(interval);
				process.stdout.write(' '.repeat(40) + '\r');
				resolve();
			}
		}, 1000);
	});
}

async function main() {
	console.log('Loading story:', reviewedStoryPath);
	const compiler = new StoryPageCompiler();
	const pages = compiler.compile(reviewedStoryPath);
	console.log(`Found ${pages.length} pages in story.`);
	const generator = new ImageGenerator();
	let prevImageBase64 = undefined;

	// Always set prevImageBase64 to the last existing image before generating or skipping
	for (let i = 0; i < pages.length; i++) {
		const page = pages[i];
		const prompt = page.image_prompt;
		let outFile;
		if (i === 0) {
			outFile = path.join(outputDir, 'front.jpg');
		} else if (i === pages.length - 1) {
			outFile = path.join(outputDir, 'back.jpg');
		} else {
			outFile = path.join(outputDir, `${i}.jpg`);
		}
		if (fs.existsSync(outFile)) {
			console.log(`Skipping page ${i + 1}, image already exists: ${outFile}`);
			prevImageBase64 = fs.readFileSync(outFile).toString('base64');
			continue;
		}
		// If this is the first page and no previous image exists, try to find the last existing image before this page
		if (!prevImageBase64 && i > 0) {
			// Look back for the most recent existing image
			for (let j = i - 1; j >= 0; j--) {
				let prevFile;
				if (j === 0) {
					prevFile = path.join(outputDir, 'front.jpg');
				} else if (j === pages.length - 1) {
					prevFile = path.join(outputDir, 'back.jpg');
				} else {
					prevFile = path.join(outputDir, `${j}.jpg`);
				}
				if (fs.existsSync(prevFile)) {
					prevImageBase64 = fs.readFileSync(prevFile).toString('base64');
					break;
				}
			}
		}
		let imageBase64 = undefined;
		if (prevImageBase64) imageBase64 = prevImageBase64;
		let label = (i === 0) ? 'Front Cover' : (i === pages.length - 1) ? 'Back Cover' : `Page ${i}`;
		console.log(`\n--- Generating image for ${label} ---`);
		if (i === 0) {
			console.log('Front cover: will pad top by 1/4 after generation.');
		} else if (i === pages.length - 1) {
			console.log('Back cover: generating as 1:1 aspect ratio.');
		} else {
			console.log('Inner page: will pad bottom by 1/4 after generation.');
		}
		console.log('Prompt:', prompt);
		if (imageBase64) {
			console.log('Passing previous image as base64 context.');
		}
		console.log('Output file:', outFile);
		try {
			await enforceRateLimit();
			const useAspect = ((i === pages.length - 1) || i === 0) ? AspectRatio.SQUARE : aspectRatio;
			const result = await generator.generateRemoteImage({
				prompt,
				aspectRatio: useAspect,
				imageBase64,
				outputFile: outFile
			});


			// === Post-process: convert to 1:1 and overlay subtitle using result.imageUrl ===
			const subtitle = page.subtitles;
			if (subtitle && result && result.imageUrl && i > 0) {
				let tempFile;
				if (result.imageUrl.startsWith('https://')) {
					// Download the image from result.imageUrl
					const https = (await import('https')).default;
					tempFile = outFile + '.downloaded';
					await new Promise((resolve, reject) => {
						const file = fs.createWriteStream(tempFile);
						https.get(result.imageUrl, (response) => {
							response.pipe(file);
							file.on('finish', () => {
								file.close(resolve);
							});
							file.on('error', reject);
						}).on('error', reject);
					});
				} else if (result.imageUrl.startsWith('data:image/')) {
					// Handle data URL: extract base64 and write to temp file
					const matches = result.imageUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
					if (matches) {
						const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
						tempFile = outFile + '.temp.' + ext;
						const base64Data = matches[2];
						fs.writeFileSync(tempFile, Buffer.from(base64Data, 'base64'));
					} else {
						console.warn(`Skipping subtitle overlay: Unsupported data URL format (${result.imageUrl.substring(0, 40)}...)`);
						tempFile = null;
					}
				} else {
					// Fallback: use outFile as the tempFile (already written by sharp)
					tempFile = outFile;
				}
				if (tempFile) {
					const origImage = sharp(tempFile);
					const metadata = await origImage.metadata();
					// Calculate new size for 1:1 (square) canvas
					const size = Math.max(metadata.width, metadata.height);
					// Pad only the bottom of the image for subtitle overlay
					const padAmount = Math.ceil(metadata.height / 3);
					let padded = origImage.extend({
						top: 0,
						bottom: padAmount,
						left: 0,
						right: 0,
						background: { r: 255, g: 255, b: 255, alpha: 1 }
					});
					// SVG overlay for text in bottom quarter (match padded image size)
					const paddedHeight = metadata.height + padAmount;
					// Use SVG <text> with manual line splitting for robust rendering
					let fontSize = Math.floor(metadata.height / 18);
					const minFontSize = 12;
					const maxWidth = metadata.width * 0.95;
					let safeSubtitle = subtitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
					// Split subtitle into lines that fit maxWidth (approximate chars per line)
					function splitLines(text, maxChars) {
						const words = text.split(' ');
						const lines = [];
						let line = '';
						for (const word of words) {
							if ((line + ' ' + word).trim().length > maxChars) {
								if (line) lines.push(line.trim());
								line = word;
							} else {
								line += ' ' + word;
							}
						}
						if (line) lines.push(line.trim());
						return lines;
					}
					// Embed MarkoOne-Regular font in SVG (ESM-compatible __dirname)
					const __dirname = path.dirname(fileURLToPath(import.meta.url));
					const fontPath = path.resolve(__dirname, 'MarkoOne-Regular.ttf');
					const fontData = fs.readFileSync(fontPath).toString('base64');
					const fontFace = `@font-face { font-family: 'MarkoOne'; src: url(data:font/ttf;base64,${fontData}) format('truetype'); }`;
					let svg = '';
					for (; fontSize >= minFontSize; fontSize -= 2) {
						// Estimate chars per line based on font size and width
						const charsPerLine = Math.floor(maxWidth / (fontSize * 0.6));
						const lines = splitLines(safeSubtitle, charsPerLine);
						const totalTextHeight = lines.length * fontSize * 1.2;
						if (totalTextHeight < padAmount * 0.95) {
							// Center text vertically in the padded area
							const startY = metadata.height + Math.floor((padAmount - totalTextHeight) / 2) + fontSize;
							svg = `<svg width="${metadata.width}" height="${paddedHeight}">
				<style><![CDATA[
					${fontFace}
				]]></style>
				<rect x="0" y="${metadata.height}" width="${metadata.width}" height="${padAmount}" fill="white" fill-opacity="0.7"/>
				<g font-size="${fontSize}" font-family="MarkoOne, sans-serif" fill="black" text-anchor="middle">
					${lines.map((line, idx) => `<text x="50%" y="${startY + idx * fontSize * 1.2}" alignment-baseline="middle">${line}</text>`).join('\n    ')}
				</g>
			</svg>`;
							break;
						}
					}
					if (!svg) {
						// Fallback: single line, smallest font
						svg = `<svg width="${metadata.width}" height="${paddedHeight}">
				<style><![CDATA[
					${fontFace}
				]]></style>
				<rect x="0" y="${metadata.height}" width="${metadata.width}" height="${padAmount}" fill="white" fill-opacity="0.7"/>
				<text x="50%" y="${metadata.height + Math.floor(padAmount / 2)}" text-anchor="middle" alignment-baseline="middle" font-size="${minFontSize}" font-family="MarkoOne, sans-serif" fill="black">${safeSubtitle}</text>
			</svg>`;
					}
					padded = padded.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);
					await padded.toFile(outFile);
					// Remove the temp file if it was a scratch file
					if (tempFile !== outFile) {
						fs.unlinkSync(tempFile);
					}
				}
			}

			// Read the generated image as base64 for the next page
			prevImageBase64 = fs.readFileSync(outFile).toString('base64');
			console.log(`Image generated for ${label}: ${outFile}`);
		} catch (err) {
			console.error(`Error generating image for ${label}:`, err.message);
			break;
		}
	}
	console.log('\nAll done.');
	process.exit(0);
}

main();
