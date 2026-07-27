/**
 * Renders the PNG app icons the web app manifest needs from the single source
 * SVG, so there is only ever one icon to edit.
 *
 * Run with: pnpm icons
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const ICONS_DIR = path.resolve(process.cwd(), 'public', 'icons');

async function main() {
  const source = await fs.readFile(path.join(ICONS_DIR, 'icon.svg'));

  const targets = [
    { file: 'icon-192.png', size: 192, padding: 0 },
    { file: 'icon-512.png', size: 512, padding: 0 },
    { file: 'apple-touch-icon.png', size: 180, padding: 0 },
    { file: 'badge.png', size: 96, padding: 0 },
    // Maskable icons are cropped to a circle by Android, so the artwork is
    // inset to keep the cup inside the safe zone.
    { file: 'maskable-512.png', size: 512, padding: 64 },
  ];

  for (const target of targets) {
    const inner = target.size - target.padding * 2;
    const rendered = await sharp(source, { density: 384 }).resize(inner, inner).png().toBuffer();

    const image =
      target.padding === 0
        ? rendered
        : await sharp({
            create: {
              width: target.size,
              height: target.size,
              channels: 4,
              background: '#ea580c',
            },
          })
            .composite([{ input: rendered, top: target.padding, left: target.padding }])
            .png()
            .toBuffer();

    await fs.writeFile(path.join(ICONS_DIR, target.file), image);
    console.log(`• ${target.file} (${target.size}×${target.size})`);
  }
}

main().catch((error) => {
  console.error('Icon generation failed:', error);
  process.exit(1);
});
