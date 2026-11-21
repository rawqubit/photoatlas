/* photoatlas — a dependency-free EXIF reader for the handful of tags a travel
 * map needs: GPS position, capture time, and the camera that shot it.
 * Everything runs on the bytes you hand it; nothing is uploaded, ever. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PhotoExif = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TYPES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 11: 4, 12: 8 };

  function Reader(view, le) {
    this.view = view;
    this.le = le;
  }
  Reader.prototype.u16 = function (o) {
    return this.view.getUint16(o, this.le);
  };
  Reader.prototype.u32 = function (o) {
    return this.view.getUint32(o, this.le);
  };
  Reader.prototype.i32 = function (o) {
    return this.view.getInt32(o, this.le);
  };

  function readRational(reader, offset) {
    if (offset < 0 || offset + 8 > reader.view.byteLength) return NaN;
    var num = reader.u32(offset);
    var den = reader.u32(offset + 4);
    return den === 0 ? NaN : num / den;
  }

  /* Returns {lat, lon, taken, camera} for an ArrayBuffer holding a JPEG.
   * Any missing or malformed tag yields null rather than throwing. */
  function readExif(buffer) {
    var out = { lat: null, lon: null, taken: null, camera: null };
    var view;
    try {
      view = new DataView(buffer);
    } catch (e) {
      return out;
    }
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return out;

    var tiff = -1;
    var p = 2;
    while (p + 4 <= view.byteLength) {
      if (view.getUint8(p) !== 0xff) break;
      var marker = view.getUint8(p + 1);
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        p += 2;
        continue;
      }
      if (marker === 0xda) break;
      var size = view.getUint16(p + 2);
      if (marker === 0xe1 && p + 10 <= view.byteLength) {
        var sig = '';
        for (var i = 0; i < 4; i++) sig += String.fromCharCode(view.getUint8(p + 4 + i));
        if (sig === 'Exif') {
          tiff = p + 10;
          break;
        }
      }
      p += 2 + size;
    }
    if (tiff < 0) return out;

    var order = String.fromCharCode(view.getUint8(tiff), view.getUint8(tiff + 1));
    if (order !== 'II' && order !== 'MM') return out;
    var reader = new Reader(view, order === 'II');
    if (reader.u16(tiff + 2) !== 0x002a) return out;

    var ifd0 = tiff + reader.u32(tiff + 4);
    var exifIfd = 0;
    var gpsIfd = 0;
    var fallbackTime = null;

    function eachEntry(dirOffset, fn) {
      if (dirOffset <= tiff || dirOffset + 2 > view.byteLength) return;
      var count = reader.u16(dirOffset);
      if (count > 512) return;
      for (var i = 0; i < count; i++) {
        var entry = dirOffset + 2 + i * 12;
        if (entry + 12 > view.byteLength) return;
        fn(reader.u16(entry), reader.u16(entry + 2), reader.u32(entry + 4), entry + 8);
      }
    }

    function ascii(entryOffset, count) {
      var at = count > 4 ? tiff + reader.u32(entryOffset) : entryOffset;
      var s = '';
      for (var i = 0; i < count && at + i < view.byteLength; i++) {
        var c = view.getUint8(at + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s;
    }

    eachEntry(ifd0, function (tag, type, count, valueAt) {
      if (tag === 0x8769) exifIfd = tiff + reader.u32(valueAt);
      else if (tag === 0x8825) gpsIfd = tiff + reader.u32(valueAt);
      else if (tag === 0x0132 && type === 2) fallbackTime = ascii(valueAt, count);
      else if (tag === 0x010f && type === 2) out.camera = ascii(valueAt, count);
    });

    if (exifIfd) {
      eachEntry(exifIfd, function (tag, type, count, valueAt) {
        if (tag === 0x9003 && type === 2) out.taken = ascii(valueAt, count);
        else if (tag === 0x9004 && type === 2 && !out.taken) out.taken = ascii(valueAt, count);
        else if (tag === 0xa002 || tag === 0xa003) {
          /* pixel dimensions, unused today, kept for future overlays */
        }
      });
    }
    if (!out.taken && fallbackTime) out.taken = fallbackTime;

    if (gpsIfd) {
      var latRef = 'N', lonRef = 'E';
      var latParts = null, lonParts = null;
      eachEntry(gpsIfd, function (tag, type, count, valueAt) {
        if (tag === 0x0001) latRef = ascii(valueAt, count) || 'N';
        else if (tag === 0x0003) lonRef = ascii(valueAt, count) || 'E';
        else if (tag === 0x0002 || tag === 0x0004) {
          if (type !== 5 || count < 3) return;
          var at = tiff + reader.u32(valueAt);
          if (at + 24 > view.byteLength) return;
          var parts = [readRational(reader, at), readRational(reader, at + 8), readRational(reader, at + 16)];
          if (!parts.every(Number.isFinite)) return;
          if (tag === 0x0002) latParts = parts;
          else lonParts = parts;
        }
      });
      if (latParts) {
        var lat = latParts[0] + latParts[1] / 60 + latParts[2] / 3600;
        out.lat = latRef.toUpperCase() === 'S' ? -lat : lat;
      }
      if (lonParts) {
        var lon = lonParts[0] + lonParts[1] / 60 + lonParts[2] / 3600;
        out.lon = lonRef.toUpperCase() === 'W' ? -lon : lon;
      }
    }

    if (out.lat !== null && (out.lat < -90 || out.lat > 90)) out.lat = null;
    if (out.lon !== null && (out.lon < -180 || out.lon > 180)) out.lon = null;
    return out;
  }

  /* ISO date string -> epoch ms, accepting the EXIF "YYYY:MM:DD HH:MM:SS" form. */
  function exifTimeToEpoch(value) {
    if (!value) return null;
    var m = /^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
    if (m) {
      return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    }
    var parsed = Date.parse(value);
    return isNaN(parsed) ? null : parsed;
  }

  return { readExif: readExif, exifTimeToEpoch: exifTimeToEpoch };
});
