"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../lib/api-client";
import type { HouseView, RecordAnswer } from "../../../lib/house";
import { IMAGERY, bearingToCompass, worldPixel } from "../../../lib/imagery";

/**
 * The House facts card (ADR-043): what the property record says about the house, each fact with
 * its source, the satellite view of the lot, and the city's permit search. Facts that agree (or
 * come from one source) pre-fill the quick pass as documented answers the tech checks; when two
 * sources disagree both are shown and the tech picks one or enters what they see.
 */
export function HouseFacts(props: {
  jobId: string;
  house: HouseView | null;
  onHouse: (h: HouseView) => void;
  /** Answers already given, so a "Use" button shows only where it changes something. */
  answered: Partial<Record<RecordAnswer["question"], unknown>>;
  onUse: (a: RecordAnswer) => void;
  onFront: (azimuth: number, source: string) => void;
}) {
  const { jobId, house, onHouse } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const started = useRef(false);

  const look = async (force: boolean) => {
    setBusy(true);
    setError(null);
    try {
      onHouse(await api<HouseView>(`/api/jobs/${jobId}/house`, { method: "POST", body: { force } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // The first time a job opens, look the house up once.
  useEffect(() => {
    if (house && house.status === null && !started.current) {
      started.current = true;
      void look(false);
    }
  }, [house]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!house) return null;
  const pending = house.status === null || busy;
  const disagree = house.rows.filter((r) => r.status === "disagree");
  const summary = pending
    ? "Looking up the house…"
    : house.status === "found"
      ? `${house.rows.length} facts from the record${disagree.length ? `, ${disagree.length} to check` : ""}`
      : house.status === "off"
        ? "Property lookup isn't set up"
        : house.status === "error"
          ? "The lookup didn't finish"
          : "No record found";

  return (
    <section className="panel house-facts" aria-busy={pending}>
      <button type="button" className="task" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>
          House facts
          <small>{summary}</small>
        </span>
        <span className={`pill ${house.status === "found" ? (disagree.length ? "warn" : "ok") : ""}`}>{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="stack">
          {house.location ? <SatelliteView lat={house.location.lat} lon={house.location.lon} onFront={props.onFront} /> : null}
          {house.rows.length > 0 ? (
            <dl className="facts">
              {house.rows.map((r) => (
                <div key={r.key} className="fact">
                  <dt>{r.label}</dt>
                  <dd>
                    {r.text ?? <span className="warn-text">Sources disagree</span>}
                    {r.answer && props.answered[r.answer.question] === undefined ? (
                      <button type="button" className="linkish" onClick={() => props.onUse(r.answer!)}>
                        Use
                      </button>
                    ) : null}
                    {r.status === "disagree"
                      ? r.readings.map((x) => (
                          <div key={x.source} className="source">
                            {x.source}: {x.text}{" "}
                            {x.answer ? (
                              <button type="button" className="linkish" onClick={() => props.onUse(x.answer!)}>
                                Use this
                              </button>
                            ) : null}
                          </div>
                        ))
                      : null}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {house.rows.length > 0 ? (
            <p className="muted fine">From the record, check it on site. Living area on a record can include rooms that aren&apos;t heated or cooled, or miss a converted garage.</p>
          ) : null}
          {house.note ? <p className="muted">{house.note}</p> : null}
          {error ? (
            <p className="issue error" role="alert">
              {error}
            </p>
          ) : null}
          {house.permit ? (
            <p>
              Permits:{" "}
              <a href={house.permit.url} target="_blank" rel="noopener noreferrer">
                {house.permit.city} permit search
              </a>{" "}
              <span className="muted fine">({house.permit.note}; look for an HVAC change-out, roof, addition or remodel)</span>
            </p>
          ) : (
            <p className="muted fine">Permits: check the city&apos;s permit search for this address.</p>
          )}
          {house.sources.length > 0 ? <p className="muted fine">Sources: {house.sources.join("; ")}.</p> : null}
          {!pending && house.status !== "found" ? (
            <div className="row">
              <button type="button" className="secondary" onClick={() => void look(true)} disabled={busy}>
                Look again
              </button>
              <span className="muted fine">Fix the address first if it&apos;s wrong.</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------
// Satellite view: USGS orthoimagery tiles (public domain, no key), drawn in an SVG so it scales to
// the screen and a tap maps to map pixels without a map library.
// ------------------------------------------------------------------------------------------------

const VIEW = 512; // pixels of the map shown, centred on the house

function SatelliteView({ lat, lon, onFront }: { lat: number; lon: number; onFront: (azimuth: number, source: string) => void }) {
  const z = IMAGERY.zoom;
  const c = worldPixel(lat, lon, z);
  const x0 = c.x - VIEW / 2;
  const y0 = c.y - VIEW / 2;
  const tiles: { x: number; y: number }[] = [];
  for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + VIEW) / 256); tx++) for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + VIEW) / 256); ty++) tiles.push({ x: tx, y: ty });
  const [mode, setMode] = useState<"idle" | "center" | "front">("idle");
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null);
  const [front, setFront] = useState<{ x: number; y: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const tap = (e: React.PointerEvent<SVGSVGElement>) => {
    if (mode === "idle" || !svg.current) return;
    const ctm = svg.current.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    if (mode === "center") {
      setCenter({ x: p.x, y: p.y });
      setFront(null);
      setMode("front");
    } else if (center) {
      setFront({ x: p.x, y: p.y });
      setMode("idle");
      onFront(bearingToCompass(center, p), `${IMAGERY.source}; front of the house tapped by the tech on the satellite view`);
    }
  };

  return (
    <figure className="satellite">
      <svg ref={svg} viewBox={`${x0} ${y0} ${VIEW} ${VIEW}`} role="img" aria-label="Satellite view of the lot" onPointerUp={tap} style={{ cursor: mode === "idle" ? "default" : "crosshair" }}>
        {tiles.map((t) => (
          <image key={`${t.x}-${t.y}`} href={IMAGERY.tile(z, t.x, t.y)} x={t.x * 256} y={t.y * 256} width={256} height={256} preserveAspectRatio="none" />
        ))}
        <circle cx={c.x} cy={c.y} r={7} className="pin" />
        {center ? <circle cx={center.x} cy={center.y} r={6} className="pin-center" /> : null}
        {center && front ? <line x1={center.x} y1={center.y} x2={front.x} y2={front.y} className="pin-line" /> : null}
      </svg>
      <figcaption>
        <span className="fine muted">{IMAGERY.credit}. The dot is the record&apos;s point, which can sit off the house.</span>
        <span className="row">
          {mode === "idle" ? (
            <button type="button" className="secondary" onClick={() => setMode("center")}>
              Set front from the map
            </button>
          ) : (
            <>
              <span role="status">{mode === "center" ? "Tap the middle of the house" : "Now tap the side the front door faces"}</span>
              <button type="button" className="linkish" onClick={() => setMode("idle")}>
                Cancel
              </button>
            </>
          )}
        </span>
      </figcaption>
    </figure>
  );
}
