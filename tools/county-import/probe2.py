"""Second layout probe (ADR-047, temporary): situs address samples (public property locations,
never owner fields), city code counts, and the text of any spreadsheet layout in the zip."""
import collections, csv, io, re, sys, zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

def xlsx_text(raw: bytes) -> None:
    z = zipfile.ZipFile(io.BytesIO(raw))
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    for name in sorted(n for n in z.namelist() if n.startswith("xl/worksheets/sheet")):
        print(f"--- {name}")
        for row in ET.fromstring(z.read(name)).iter("{%s}row" % NS["m"]):
            cells = []
            for c in row.findall("m:c", NS):
                v = c.find("m:v", NS)
                if v is None:
                    continue
                cells.append(shared[int(v.text)] if c.get("t") == "s" else v.text)
            if cells:
                print(" | ".join(x.replace("\n", " ") for x in cells))

def reader(z, name):
    text = z.read(name).decode("latin-1")
    d = max(["|", ",", "\t"], key=text[:2000].count)
    return csv.DictReader(io.StringIO(text), delimiter=d)

def dallas(z):
    for n in z.namelist():
        if n.lower().endswith(".xlsx"):
            xlsx_text(z.read(n))
    cols = ["STREET_NUM", "STREET_HALF_NUM", "FULL_STREET_NAME", "BLDG_ID", "UNIT_ID", "PROPERTY_CITY", "PROPERTY_ZIPCODE"]
    n = 0
    cities = collections.Counter()
    units = collections.Counter()
    for r in reader(z, "ACCOUNT_INFO.CSV"):
        if r["DIVISION_CD"] != "RES":
            continue
        cities[r["PROPERTY_CITY"].strip()] += 1
        units[bool(r["UNIT_ID"].strip())] += 1
        if n < 40 and (n < 25 or r["UNIT_ID"].strip() or r["STREET_HALF_NUM"].strip()):
            print(" | ".join(f"{c}={r[c].strip()!r}" for c in cols))
            n += 1
    print("RES with unit:", dict(units))
    print("cities:", "; ".join(f"{c}x{k}" for c, k in cities.most_common(80)))
    multi = collections.Counter()
    for r in reader(z, "RES_DETAIL.CSV"):
        multi[r["ACCOUNT_NUM"]] += 1
    print("RES_DETAIL buildings per account:", collections.Counter(multi.values()).most_common(6))

def tarrant(z):
    name = [n for n in z.namelist() if n.lower().endswith(".txt")][0]
    codes = collections.Counter()
    n = 0
    for r in reader(z, name):
        codes[(r["City"].strip(), r["School"].strip())] += 1
        if n < 30:
            print(f"Situs_Address={r['Situs_Address'].strip()!r} City={r['City'].strip()!r} Class={r['Property_Class'].strip()!r} Year={r['Year_Built'].strip()} Area={r['Living_Area'].strip()} Pool={r['Swimming_Pool_Ind'].strip()}")
            n += 1
    city = collections.Counter()
    for (c, s), k in codes.items():
        city[c] += k
    print("city codes:", "; ".join(f"{c!r}x{k}" for c, k in sorted(city.items())))
    acct = collections.Counter()
    for r in reader(z, name):
        acct[" ".join(r["Situs_Address"].upper().split()) + "|" + r["City"].strip()] += 1
    print("situs+city duplicates:", collections.Counter(acct.values()).most_common(6))

def listing(z):
    for info in z.infolist():
        print(f"{info.filename}\t{info.file_size}")
    for info in z.infolist():
        low = info.filename.lower()
        if low.endswith((".csv", ".txt")) and info.file_size > 0:
            with z.open(info) as f:
                head = f.readline().decode("latin-1").strip()
            print(f"== {info.filename}: {head[:3000]}")
        elif low.endswith(".xlsx"):
            print(f"== {info.filename}")
            xlsx_text(z.read(info))

if __name__ == "__main__":
    which, path = sys.argv[1], sys.argv[2]
    z = zipfile.ZipFile(path)
    {"dallas": dallas, "tarrant": tarrant, "list": listing}[which](z)
