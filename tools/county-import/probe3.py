"""Third layout probe (ADR-047, temporary): Tarrant's True Prodigy export. Profiles improvement
types, detail types and feature codes, and prints situs fields (public property locations, never
owner fields). Positions are from TAD's TP Legacy 8.0.33 layout (1-based, inclusive)."""
import collections, io, sys, zipfile

def f(line, a, b):
    return line[a - 1:b].strip()

def member(z, suffix):
    name = [n for n in z.namelist() if n.endswith(suffix)][0]
    return io.TextIOWrapper(z.open(name), encoding="latin-1", newline="")

def main(path):
    z = zipfile.ZipFile(path)
    # Property file: situs and type.
    types, sups, cities, units, lens = (collections.Counter() for _ in range(5))
    shown = 0
    props = collections.Counter()
    for line in member(z, "_APPRAISAL_INFO.TXT"):
        lens[len(line)] += 1
        t = f(line, 13, 17); types[t] += 1
        sups[f(line, 23, 34)] += 1
        props[f(line, 1, 12)] += 1
        if t != "R":
            continue
        cities[f(line, 1110, 1139)] += 1
        units[bool(f(line, 4475, 4479))] += 1
        if shown < 30:
            print("situs:", repr(f(line, 4460, 4474)), repr(f(line, 1040, 1049)), repr(f(line, 1050, 1099)), repr(f(line, 1100, 1109)), "unit", repr(f(line, 4475, 4479)), "city", repr(f(line, 1110, 1139)), "zip", repr(f(line, 1140, 1149)), "geo", repr(f(line, 547, 596)), "ref1", repr(f(line, 4410, 4434)), "ref2", repr(f(line, 4435, 4459)), "imprv_state", repr(f(line, 2732, 2741)))
            shown += 1
    print("line lengths:", lens.most_common(5))
    print("prop types:", types.most_common())
    print("sup_num:", sups.most_common(5))
    print("records per prop_id:", collections.Counter(props.values()).most_common(5))
    print("R with unit:", dict(units))
    print("situs cities:", "; ".join(f"{c!r}x{k}" for c, k in cities.most_common(70)))
    it = collections.Counter()
    for line in member(z, "_APPRAISAL_IMPROVEMENT_INFO.TXT"):
        it[(f(line, 29, 38), f(line, 39, 63), f(line, 64, 68))] += 1
    print("improvement types:", "; ".join(f"{k}x{v}" for k, v in it.most_common(40)))
    dt = collections.Counter()
    for line in member(z, "_APPRAISAL_IMPROVEMENT_DETAIL.TXT"):
        dt[(f(line, 41, 50), f(line, 51, 75))] += 1
    print("detail types:", "; ".join(f"{k}x{v}" for k, v in dt.most_common(80)))
    at = collections.defaultdict(collections.Counter)
    for line in member(z, "_APPRAISAL_IMPROVEMENT_DETAIL_ATTR.TXT"):
        at[f(line, 53, 77)][f(line, 78, 87)] += 1
    for desc, c in sorted(at.items(), key=lambda kv: -sum(kv[1].values())):
        print(f"attr {desc!r} ({sum(c.values())}):", "; ".join(f"{v!r}x{k}" for v, k in c.most_common(25)))

if __name__ == "__main__":
    main(sys.argv[1])
