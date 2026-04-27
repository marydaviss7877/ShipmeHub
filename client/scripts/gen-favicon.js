/**
 * Generates favicon.ico from favicon.svg using sharp.
 * ICO format: 6-byte header + directory entries + PNG image data.
 * Modern browsers accept PNG-compressed ICO, so we embed a 32x32 PNG.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG_PATH = path.join(__dirname, '../public/favicon.svg');
const ICO_PATH = path.join(__dirname, '../public/favicon.ico');

async function buildIco() {
  // Render SVG → 32×32 PNG buffer
  const png32 = await sharp(SVG_PATH)
    .resize(32, 32)
    .png()
    .toBuffer();

  // Also render a 16×16 copy for the directory
  const png16 = await sharp(SVG_PATH)
    .resize(16, 16)
    .png()
    .toBuffer();

  // ICO file = ICONDIR (6 bytes) + ICONDIRENTRY×2 (16 bytes each) + image data
  const ICONDIR_SIZE = 6;
  const ENTRY_SIZE = 16;
  const entries = 2;
  const headerSize = ICONDIR_SIZE + ENTRY_SIZE * entries;

  const buf = Buffer.alloc(headerSize + png16.length + png32.length);
  let offset = 0;

  // ICONDIR
  buf.writeUInt16LE(0, offset);       // reserved
  buf.writeUInt16LE(1, offset + 2);   // type: 1 = ICO
  buf.writeUInt16LE(entries, offset + 4); // number of images
  offset += 6;

  // ICONDIRENTRY for 16×16
  const off16 = headerSize;
  buf.writeUInt8(16, offset);         // width  (0 = 256)
  buf.writeUInt8(16, offset + 1);     // height
  buf.writeUInt8(0, offset + 2);      // color count
  buf.writeUInt8(0, offset + 3);      // reserved
  buf.writeUInt16LE(1, offset + 4);   // planes
  buf.writeUInt16LE(32, offset + 6);  // bit count
  buf.writeUInt32LE(png16.length, offset + 8);  // size of image data
  buf.writeUInt32LE(off16, offset + 12);         // offset of image data
  offset += 16;

  // ICONDIRENTRY for 32×32
  const off32 = headerSize + png16.length;
  buf.writeUInt8(32, offset);
  buf.writeUInt8(32, offset + 1);
  buf.writeUInt8(0, offset + 2);
  buf.writeUInt8(0, offset + 3);
  buf.writeUInt16LE(1, offset + 4);
  buf.writeUInt16LE(32, offset + 6);
  buf.writeUInt32LE(png32.length, offset + 8);
  buf.writeUInt32LE(off32, offset + 12);
  offset += 16;

  // Write PNG data
  png16.copy(buf, off16);
  png32.copy(buf, off32);

  fs.writeFileSync(ICO_PATH, buf);
  console.log(`favicon.ico written — 16px: ${png16.length}B, 32px: ${png32.length}B, total: ${buf.length}B`);
}

buildIco().catch(err => { console.error(err); process.exit(1); });
