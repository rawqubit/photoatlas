"""Build synthetic JPEGs with GPS EXIF, so the parser is tested against bytes
rather than against itself. Run: python3 test/make-fixtures.py"""
import base64, struct, os

# 1x1 grey JPEG
TINY = base64.b64decode(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a"
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA"
    "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=="
)

def rational(v):
    # seconds precision: value * 1e6 / 1e6
    return (int(round(v * 1000000)) & 0xFFFFFFFF, 1000000)

def deg_to_dms(d):
    d = abs(d)
    deg = int(d)
    rest = (d - deg) * 60
    mi = int(rest)
    se = (rest - mi) * 60
    return deg, mi, se

def build(lat, lon, when, make="TestCam"):
    le = "<"
    # layout: header(8) | IFD0 | ExifIFD | GPSIFD | data area
    ifd0_entries = 3
    ifd0_size = 2 + ifd0_entries * 12 + 4
    ifd0_off = 8
    exif_off = ifd0_off + ifd0_size
    exif_size = 2 + 1 * 12 + 4
    gps_off = exif_off + exif_size
    gps_size = 2 + 4 * 12 + 4
    data_off = gps_off + gps_size

    data = b""
    def add(b):
        nonlocal data
        off = data_off + len(data)
        data += b
        if len(data) % 2:
            data += b"\0"
        return off

    lat_off = add(b"".join(struct.pack(le + "II", *rational(v)) for v in deg_to_dms(lat)))
    lon_off = add(b"".join(struct.pack(le + "II", *rational(v)) for v in deg_to_dms(lon)))
    when_off = add(when.encode() + b"\0")
    make_off = add(make.encode() + b"\0")

    def entry(tag, typ, count, value):
        return struct.pack(le + "HHI", tag, typ, count) + struct.pack(le + "I", value)

    ifd0 = struct.pack(le + "H", ifd0_entries)
    ifd0 += entry(0x010F, 2, len(make) + 1, make_off)
    ifd0 += entry(0x8769, 4, 1, exif_off)
    ifd0 += entry(0x8825, 4, 1, gps_off)
    ifd0 += struct.pack(le + "I", 0)

    exif = struct.pack(le + "H", 1)
    exif += entry(0x9003, 2, len(when) + 1, when_off)
    exif += struct.pack(le + "I", 0)

    gps = struct.pack(le + "H", 4)
    gps += entry(0x0001, 2, 2, ord("N" if lat >= 0 else "S"))
    gps += entry(0x0002, 5, 3, lat_off)
    gps += entry(0x0003, 2, 2, ord("E" if lon >= 0 else "W"))
    gps += entry(0x0004, 5, 3, lon_off)
    gps += struct.pack(le + "I", 0)

    tiff = b"II" + struct.pack(le + "H", 0x002A) + struct.pack(le + "I", ifd0_off) + ifd0 + exif + gps + data
    app1 = b"Exif\0\0" + tiff
    segment = b"\xff\xe1" + struct.pack(">H", len(app1) + 2) + app1
    return TINY[:2] + segment + TINY[2:]

os.makedirs("test/fixtures", exist_ok=True)
cases = [
    ("paris.jpg", 48.8584, 2.2945, "2019:06:14 18:22:31"),
    ("sydney.jpg", -33.8688, 151.2093, "2021:11:02 07:05:00"),
    ("nyc.jpg", 40.7128, -74.0060, "2023:03:19 12:00:00"),
]
for name, lat, lon, when in cases:
    open("test/fixtures/" + name, "wb").write(build(lat, lon, when))
    print("wrote", name, lat, lon, when)
