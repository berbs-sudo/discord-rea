const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Generate a valid 256x256 PNG and wrap it in a valid Windows .ICO container
function createPngBuffer(width, height) {
  const rawData = Buffer.alloc(height * (1 + width * 4));
  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.44;

  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rawData[rowStart] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const idx = rowStart + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > radius) {
        rawData[idx] = 0;
        rawData[idx + 1] = 0;
        rawData[idx + 2] = 0;
        rawData[idx + 3] = 0;
        continue;
      }

      // Discord Blurple gradient (#5865F2 -> #4752C4)
      let r = 88;
      let g = 101;
      let b = 242;
      let a = 255;

      // Draw simplified controller / headset visor icon in white in the center
      const nx = dx / radius;
      const ny = dy / radius;
      const inBody =
        Math.abs(nx) < 0.56 &&
        Math.abs(ny) < 0.36 &&
        (nx * nx) / 0.32 + (ny * ny) / 0.14 <= 1.0;
      const leftEye = (nx + 0.22) ** 2 + (ny + 0.02) ** 2 < 0.016;
      const rightEye = (nx - 0.22) ** 2 + (ny + 0.02) ** 2 < 0.016;

      if (inBody && !leftEye && !rightEye) {
        r = 255;
        g = 255;
        b = 255;
      }

      rawData[idx] = r;
      rawData[idx + 1] = g;
      rawData[idx + 2] = b;
      rawData[idx + 3] = a;
    }
  }

  function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) {
      c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff];
    }
    return (c ^ -1) >>> 0;
  }
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(rawData);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function createIcoFromPng(pngBuf) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(1, 4); // 1 image

  const dir = Buffer.alloc(16);
  dir[0] = 0; // 256 width
  dir[1] = 0; // 256 height
  dir[2] = 0; // palette
  dir[3] = 0; // reserved
  dir.writeUInt16LE(1, 4); // color planes
  dir.writeUInt16LE(32, 6); // bits per pixel
  dir.writeUInt32LE(pngBuf.length, 8); // size
  dir.writeUInt32LE(6 + 16, 12); // offset

  return Buffer.concat([header, dir, pngBuf]);
}

const buildDir = path.join(__dirname, 'build');
const pubDir = path.join(__dirname, 'public');
fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(pubDir, { recursive: true });

const png = createPngBuffer(256, 256);
const ico = createIcoFromPng(png);

fs.writeFileSync(path.join(pubDir, 'icon.png'), png);
fs.writeFileSync(path.join(buildDir, 'icon.png'), png);
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
console.log('Generated build/icon.ico and public/icon.png successfully!');

