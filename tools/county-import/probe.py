"""Prints the layout of a county appraisal download: files, row counts, columns and the most
common values of the building columns. Owner, mailing, value and legal columns are never
printed (the CI log is public). Temporary: used once to write the importers (ADR-047)."""
import collections, csv, io, re, sys, zipfile

SKIP = re.compile(r"OWNER|NAME|MAIL|ADDR|PHONE|ZIP|ACCT|ACCOUNT|GIS|LEGAL|DEED|INSTR|VAL|EXEMPT|MKT|APPR|TAX|AGENT|PARCEL|ID$|_ID|NUM$|SITUS|STREET|STR_|LOT|BLOCK|SUBD|PIDN|NBHD|MAPSCO|DATE|_DT|PCT|PRICE|AMT", re.I)

def sniff(first: str) -> str:
    return max(["|", ",", "\t"], key=first.count)

def profile(name: str, raw: bytes) -> None:
    text = raw.decode("latin-1")
    lines = text.splitlines()
    print(f"\n=== {name}: {len(lines) - 1} rows")
    if not lines:
        return
    d = sniff(lines[0])
    rows = csv.reader(io.StringIO(text), delimiter=d)
    header = [h.strip() for h in next(rows)]
    print("delimiter", repr(d))
    print("columns:", ", ".join(header))
    counts = [collections.Counter() for _ in header]
    for n, r in enumerate(rows):
        if n >= 300000:
            break
        for i, v in enumerate(r[: len(header)]):
            counts[i][v.strip()] += 1
    for i, h in enumerate(header):
        if SKIP.search(h):
            continue
        top = counts[i].most_common(8)
        if top:
            print(f"  {h}: " + "; ".join(f"{v!r}x{c}" for v, c in top))

def main(path: str) -> None:
    z = zipfile.ZipFile(path)
    for info in z.infolist():
        print(f"{info.filename}\t{info.file_size}")
    for info in z.infolist():
        low = info.filename.lower()
        if low.endswith((".csv", ".txt")) and info.file_size > 0:
            profile(info.filename, z.read(info))
        elif low.endswith((".pdf", ".doc", ".docx", ".xls", ".xlsx")):
            print(f"(layout document: {info.filename})")

if __name__ == "__main__":
    main(sys.argv[1])
