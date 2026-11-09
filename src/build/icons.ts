import { crc32, deflateSync } from 'node:zlib';

function chunk(type: string, contents: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type), contents]);
  const header = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  header.writeUInt32BE(contents.length);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([header, body, checksum]);
}

/** Rasterize the source icon's round SVG line segments with supersampling. */
export function rasterizeIcon(svg: string, size: number): Buffer {
  const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const radius = (color: string): number =>
    Number(
      svg.match(new RegExp(`stroke="${color}" stroke-width="([\\d.]+)"`))?.[1],
    ) / 2;
  const blackRadius = radius('black');
  const whiteRadius = radius('white');
  const segments = [...svg.matchAll(/<line\s+([^>]+)\/>/g)].map(
    ([, attributes]) => {
      const coords = Object.fromEntries(
        [...attributes.matchAll(/(x1|y1|x2|y2)="([\d.-]+)"/g)].map(
          ([, name, value]) => [name, Number(value)],
        ),
      );
      return [coords.x1, coords.y1, coords.x2, coords.y2];
    },
  );
  if (
    !viewBox ||
    !blackRadius ||
    !(whiteRadius > blackRadius) ||
    !segments.length ||
    segments.some((line) => line.some((n) => !Number.isFinite(n)))
  )
    throw new Error('Unsupported icon SVG geometry');
  const distance = (x: number, y: number): number =>
    Math.min(
      ...segments.map(([a, b, c, d]) => {
        const t = Math.max(
          0,
          Math.min(
            1,
            ((x - a) * (c - a) + (y - b) * (d - b)) /
              ((c - a) ** 2 + (d - b) ** 2),
          ),
        );
        return Math.hypot(x - a - t * (c - a), y - b - t * (d - b));
      }),
    );
  const width = Number(viewBox[1]),
    height = Number(viewBox[2]);
  const rows = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let coverage = 0;
      let whiteCoverage = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const sample = distance(
            ((x + (sx + 0.5) / 4) * width) / size,
            ((y + (sy + 0.5) / 4) * height) / size,
          );
          if (sample <= whiteRadius) coverage++;
          if (sample > blackRadius && sample <= whiteRadius) whiteCoverage++;
        }
      const index = y * (1 + size * 4) + 1 + x * 4;
      rows[index] =
        rows[index + 1] =
        rows[index + 2] =
          coverage ? Math.round((255 * whiteCoverage) / coverage) : 0;
      rows[index + 3] = Math.round((255 * coverage) / 16);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
