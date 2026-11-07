"""Fourth probe (ADR-047, temporary): the tail of Tarrant's TP feature records (where the counts
sit) and the detail rows of a few residential properties. No owner fields are read."""
import collections, io, sys, zipfile

def member(z, suffix):
    name = [n for n in z.namelist() if n.endswith(suffix)][0]
    return io.TextIOWrapper(z.open(name), encoding="latin-1", newline="")

def main(path):
    z = zipfile.ZipFile(path)
    lens = collections.Counter()
    tails = collections.defaultdict(collections.Counter)
    sample = {}
    for line in member(z, "_APPRAISAL_IMPROVEMENT_DETAIL_ATTR.TXT"):
        line = line.rstrip("\r\n")
        lens[len(line)] += 1
        desc = line[52:77].strip()
        if desc in ("Rooms", "CentralHeatAir", "Foundation", "ExtCover", "NoOfUnits", "RoofMaterial", "HeatCool"):
            tails[(desc, line[77:87].strip())][line[87:].strip()] += 1
            pid = line[0:12]
            if len(sample) < 8 and desc == "Rooms":
                sample[pid] = []
    print("attr line lengths:", lens.most_common(6))
    for k, c in tails.items():
        print("tail", k, "; ".join(f"{v!r}x{n}" for v, n in c.most_common(15)))
    for line in member(z, "_APPRAISAL_IMPROVEMENT_DETAIL.TXT"):
        pid = line[0:12]
        if pid in sample:
            sample[pid].append(f"imprv {line[16:28].strip()} det {line[40:50].strip()!r} class {line[75:85].strip()!r} yr {line[85:89]} area {line[93:108].strip()}")
    for line in member(z, "_APPRAISAL_IMPROVEMENT_INFO.TXT"):
        pid = line[0:12]
        if pid in sample:
            sample[pid].append(f"IMPRV {line[16:28].strip()} type {line[28:38].strip()!r} state {line[63:68].strip()!r} homesite {line[68:69]!r}")
    for pid, rows in sample.items():
        print("prop", pid.strip())
        for r in rows:
            print("   ", r)
    # Living area candidates vs the legacy file are compared by the importer's own checks.

if __name__ == "__main__":
    main(sys.argv[1])
