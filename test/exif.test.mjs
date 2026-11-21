// node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readExif, exifTimeToEpoch } = require('../src/exif.js');

const load = (name) => {
  const bytes = readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

const near = (actual, expected, tolerance = 1e-5) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} !~ ${expected}`);

test('reads GPS from a north-east photo', () => {
  const r = readExif(load('paris.jpg'));
  near(r.lat, 48.8584);
  near(r.lon, 2.2945);
  assert.equal(r.taken, '2019:06:14 18:22:31');
  assert.equal(r.camera, 'TestCam');
});

test('handles southern and western hemispheres', () => {
  const sydney = readExif(load('sydney.jpg'));
  near(sydney.lat, -33.8688);
  near(sydney.lon, 151.2093);

  const nyc = readExif(load('nyc.jpg'));
  near(nyc.lat, 40.7128);
  near(nyc.lon, -74.006);
});

test('converts EXIF timestamps to epoch milliseconds', () => {
  assert.equal(exifTimeToEpoch('2019:06:14 18:22:31'), Date.UTC(2019, 5, 14, 18, 22, 31));
  assert.equal(exifTimeToEpoch('2023:03:19 12:00:00'), Date.UTC(2023, 2, 19, 12, 0, 0));
  assert.equal(exifTimeToEpoch(null), null);
  assert.equal(exifTimeToEpoch('not a date'), null);
});

test('returns empty fields instead of throwing on junk input', () => {
  const empty = new ArrayBuffer(0);
  assert.deepEqual(readExif(empty), { lat: null, lon: null, taken: null, camera: null });

  const notJpeg = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
  assert.deepEqual(readExif(notJpeg), { lat: null, lon: null, taken: null, camera: null });

  // A JPEG truncated mid-EXIF must not read past the buffer.
  const paris = load('paris.jpg');
  const truncated = paris.slice(0, 120);
  const r = readExif(truncated);
  assert.ok(r.lat === null || Number.isFinite(r.lat));
});
