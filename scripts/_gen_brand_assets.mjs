import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const logo = readFileSync('public/logo.svg');

const TILE = `
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6b59e8"/>
      <stop offset="1" stop-color="#3a2a99"/>
    </linearGradient>
  </defs>`;

const MARK = `
  <g stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" opacity="0.5">
    <path d="M32 7.5v5"/>
    <path d="M56.5 32h-5"/>
    <path d="M32 56.5v-5"/>
    <path d="M7.5 32h5"/>
  </g>
  <g transform="rotate(28 32 32)">
    <path fill="#ffffff" fill-rule="evenodd" d="M32 13 49 28 32 38 15 28Z M32 23.55a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 1 0 0-6.4Z"/>
    <path fill="none" stroke="#ffffff" stroke-width="3.1" stroke-linecap="round" d="M24.5 35V43.5Q24.5 47 32 47Q39.5 47 39.5 43.5V35"/>
  </g>
  <path d="M48.9 36.6v7.2" stroke="#ffffff" stroke-width="2.7" stroke-linecap="round"/>
  <circle cx="48.9" cy="47" r="2.5" fill="#ffffff"/>`;

const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">
  ${TILE}
  <rect width="64" height="64" fill="url(#tile)"/>
  ${MARK}
</svg>`;

const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">
  ${TILE}
  <rect width="64" height="64" fill="url(#tile)"/>
  <g transform="translate(6.4 6.4) scale(0.8)">${MARK}</g>
</svg>`;

const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  ${TILE}
  <rect width="1200" height="630" fill="#0a1530"/>
  <rect x="96" y="203" width="224" height="224" rx="52" fill="url(#tile)"/>
  <g transform="translate(96 203) scale(3.5)">${MARK}</g>
  <text x="376" y="296" font-family="Malgun Gothic, Apple SD Gothic Neo, sans-serif" font-size="76" font-weight="700" fill="#ffffff">한성 학사 도우미</text>
  <text x="376" y="372" font-family="Malgun Gothic, Apple SD Gothic Neo, sans-serif" font-size="36" fill="#9aa7c7">강의·활동·일정·시간표, 한곳에서</text>
  <text x="376" y="452" font-family="Consolas, monospace" font-size="24" letter-spacing="6" fill="#5645d4">MY ACADEMIC COMPASS</text>
</svg>`;

await sharp(logo).resize(192).png().toFile('public/icons/icon-192.png');
await sharp(logo).resize(512).png().toFile('public/icons/icon-512.png');
await sharp(Buffer.from(maskable)).png().toFile('public/icons/icon-maskable-512.png');
await sharp(Buffer.from(fullBleed)).resize(180).png().toFile('public/apple-touch-icon.png');
await sharp(Buffer.from(og)).png().toFile('public/og.png');
console.log('brand assets generated');
