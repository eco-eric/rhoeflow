"use client";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_ZOOM_STEP,
  ESRI,
  IMAGERY,
  ZOOM_STEPS,
  bearing,
  compassLabel,
  esriTiles,
  esriZoomFor,
  headingFromOrientation,
  imageryMeta,
  mapToOffset,
  nearestZoomStep,
  offsetToMap,
  pointToward,
  satelliteImageUrl,
  scaleBar,
  snapToCompass,
  toMap,
  type ImagerySource,
} from "../../../lib/imagery";
import { KEEP_CLEAR, STREETS, placeLabels, type Street } from "../../../lib/streets";

/**
 * The satellite map of the lot (ADR-043, ADR-044, ADR-045): north up, with north and the four
 * compass points marked, the streets drawn as blue dashed lines with their names, zoom by pinch or
 * the + and − buttons, an arrow from the house for the front direction picked so far, and two ways
 * to set it without leaving the app: tap the side of the house the front door is on, or stand at
 * the front door with the phone pointing out to the street and use the phone's compass.
 */

const S = IMAGERY.px; // the map is drawn in a square of this many units
const MID = S / 2;

export type FrontPick = { azimuth: number; source: string; via: "map" | "compass" };

type Offset = { dx: number; dy: number };

export function SatelliteMap(props: {
  lat: number;
  lon: number;
  /** The front direction picked so far (degrees, 0 = north), drawn as an arrow from the house. */
  value?: number | null | undefined;
  onPick: (p: FrontPick) => void;
  /** Show the phone compass button (on the Q5 map; not needed in House facts). */
  compass?: boolean;
  /** Esri when the server has an ArcGIS key; NAIP otherwise, and whenever an Esri tile fails. */
  imagery?: ImagerySource;
}) {
  const { lat, lon, value, onPick } = props;
  const svg = useRef<SVGSVGElement>(null);
  const [step, setStep] = useState(DEFAULT_ZOOM_STEP);
  const half = ZOOM_STEPS[step]!;
  const [failed, setFailed] = useState(false);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [tilesLoaded, setTilesLoaded] = useState<Set<string>>(() => new Set());
  // Where the house is, as ground offset from the record's point, until the tech moves it onto the house.
  const [house, setHouse] = useState<Offset>({ dx: 0, dy: 0 });
  const [moving, setMoving] = useState(false);
  const [tapped, setTapped] = useState<Offset | null>(null);
  const live = useCompass();
  const [src, setSrc] = useState<ImagerySource>(props.imagery ?? "naip");
  const [esriNote, setEsriNote] = useState<string | null>(null);
  const streets = useStreets(lat, lon);
  const url = satelliteImageUrl(lat, lon, half);
  const tiles = src === "esri" ? esriTiles(lat, lon, half, S, esriZoomFor(lat, half)) : [];
  const meta = imageryMeta(src);
  const ready = src === "esri" ? tiles.every((t) => tilesLoaded.has(`${t.z}/${t.x}/${t.y}`)) : loadedUrl === url;
  const [pinch, setPinch] = useState(1);

  // A new place or imagery choice starts the map over; a zoom keeps the tech's marks.
  useEffect(() => {
    setFailed(false);
    setSrc(props.imagery ?? "naip");
    setHouse({ dx: 0, dy: 0 });
    setTapped(null);
    setStep(DEFAULT_ZOOM_STEP);
  }, [lat, lon, props.imagery]);

  // When the map ends up on the USGS picture, ask the server why Esri isn't in use and say so.
  useEffect(() => {
    if (src !== "naip") return;
    let gone = false;
    fetch("/api/imagery/status", { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<{ key: boolean; ok: boolean; reason: string | null }>) : null))
      .then((s) => {
        if (gone || !s) return;
        if (!s.key) setEsriNote("The sharper Esri imagery isn't set up on the server.");
        else if (!s.ok) setEsriNote(`Esri imagery is off. ${s.reason ?? ""}`.trim());
        else setEsriNote(null);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [src]);

  const housePt = offsetToMap(lat, half, house);
  const tappedPt = tapped ? offsetToMap(lat, half, tapped) : null;

  const toUnits = (clientX: number, clientY: number) => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: Math.min(S, Math.max(0, p.x)), y: Math.min(S, Math.max(0, p.y)) };
  };

  const tap = (clientX: number, clientY: number) => {
    const pt = toUnits(clientX, clientY);
    if (!pt) return;
    if (moving) {
      setHouse(mapToOffset(lat, half, pt));
      setTapped(null);
      setMoving(false);
      return;
    }
    if (Math.hypot(pt.x - housePt.x, pt.y - housePt.y) < 18) return; // a tap on the house itself says nothing
    setTapped(mapToOffset(lat, half, pt));
    onPick({
      azimuth: snapToCompass(bearing(housePt, pt)),
      source: `${meta.source}${streets.list.length ? `, with streets from ${STREETS.source}` : ""}; front of the house tapped by the tech on the satellite map`,
      via: "map",
    });
  };

  // Taps and pinches. One finger that stays put is a tap; two fingers pinch the map to the nearest
  // zoom step when they let go. A finger that moves is the page scrolling, not a tap.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: number; scale: number } | null>(null);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button > 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      downAt.current = { x: e.clientX, y: e.clientY };
      moved.current = false;
    } else if (pointers.current.size === 2) {
      gesture.current = { start: spread() || 1, scale: 1 };
      moved.current = true;
      try {
        svg.current?.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety */
      }
    }
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.current && pointers.current.size >= 2) {
      gesture.current.scale = Math.min(4, Math.max(0.25, spread() / gesture.current.start));
      setPinch(gesture.current.scale);
    } else if (downAt.current && Math.hypot(e.clientX - downAt.current.x, e.clientY - downAt.current.y) > 10) moved.current = true;
  };
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const single = pointers.current.size === 1 && !gesture.current;
    pointers.current.delete(e.pointerId);
    if (gesture.current && pointers.current.size < 2) {
      const scale = gesture.current.scale;
      gesture.current = null;
      setPinch(1);
      if (Math.abs(Math.log(scale)) > 0.12) setStep(nearestZoomStep(half / scale));
      return;
    }
    if (single && !moved.current && e.type === "pointerup") tap(e.clientX, e.clientY);
  };
  const onCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2 && gesture.current) {
      gesture.current = null;
      setPinch(1);
    }
    moved.current = true;
  };

  const arrowLen = S * 0.3;
  const picked = typeof value === "number" ? value : null;
  const end = picked !== null ? pointToward(housePt, picked, arrowLen) : null;
  const liveEnd = live.heading !== null ? pointToward(housePt, live.heading, arrowLen * 0.8) : null;
  const bar = scaleBar(half);

  const drawn = streets.list.map((s) => {
    const paths = s.paths.map((p) => p.map(([la, lo]) => toMap({ lat, lon }, half, { lat: la, lon: lo })));
    return { s, paths, d: paths.map((p) => p.map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join("")).join("") };
  });
  // One name per street, clear of the other names, the map's marks and the front arrow.
  const labels = placeLabels(
    drawn.map(({ s, paths }) => ({ name: s.name, major: s.major, paths })),
    S,
    { keepClear: KEEP_CLEAR, house: housePt, arrowEnd: end },
  );

  return (
    <figure className="satellite">
      <div className="satellite-frame">
        <svg
          ref={svg}
          viewBox={`0 0 ${S} ${S}`}
          role="img"
          aria-label={`Satellite map of the lot, north up${picked !== null ? `, front marked ${compassLabel(picked)}` : ""}${labels.length ? `, streets: ${labels.map((l) => l.name).join(", ")}` : ""}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          style={{ cursor: "crosshair" }}
        >
          <g transform={pinch !== 1 ? `translate(${MID} ${MID}) scale(${pinch}) translate(${-MID} ${-MID})` : undefined}>
            {src === "esri"
              ? tiles.map((t) => (
                  <image
                    key={`${t.z}/${t.x}/${t.y}`}
                    href={ESRI.proxy(t.z, t.x, t.y)}
                    x={t.left}
                    y={t.top}
                    width={t.size + 0.5}
                    height={t.size + 0.5}
                    preserveAspectRatio="none"
                    onLoad={() => setTilesLoaded((s) => new Set(s).add(`${t.z}/${t.x}/${t.y}`))}
                    onError={() => setSrc("naip")}
                  />
                ))
              : !failed ? (
                  <image key={url} href={url} x={0} y={0} width={S} height={S} preserveAspectRatio="none" onLoad={() => setLoadedUrl(url)} onError={() => setFailed(true)} />
                ) : null}
            {/* Streets: a dark edge under a blue dash, so the line shows on light roofs and dark trees. */}
            <g aria-hidden="true">
              {drawn.map(({ s, d }, i) => (
                <path key={`c${i}`} d={d} className="street-casing" style={s.major ? { strokeWidth: 11 } : undefined} />
              ))}
              {drawn.map(({ s, d }, i) => (
                <path key={`l${i}`} d={d} className="street-line" style={s.major ? { strokeWidth: 7 } : undefined} />
              ))}
              {labels.map((l) => (
                <text key={l.name} className="street-name" textAnchor="middle" transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.angle.toFixed(1)})`} y={-10}>
                  {l.name}
                </text>
              ))}
            </g>
            {liveEnd ? <line x1={housePt.x} y1={housePt.y} x2={liveEnd.x} y2={liveEnd.y} className="pin-live" /> : null}
            {end ? (
              <g className="front-arrow">
                <line x1={housePt.x} y1={housePt.y} x2={end.x} y2={end.y} className="pin-line" />
                <circle cx={end.x} cy={end.y} r={26} className="pin-head" />
                <text x={end.x} y={end.y + 8} textAnchor="middle" className="pin-head-text">
                  {compassLabel(picked!)}
                </text>
              </g>
            ) : null}
            {tappedPt && !end ? <circle cx={tappedPt.x} cy={tappedPt.y} r={9} className="pin-center" /> : null}
            <circle cx={housePt.x} cy={housePt.y} r={11} className="pin" />
          </g>
          {/* Compass points round the edge; north is straight up. */}
          {(
            [
              ["N", MID, 38],
              ["E", S - 26, MID + 11],
              ["S", MID, S - 14],
              ["W", 26, MID + 11],
            ] as const
          ).map(([t, x, y]) => (
            <text key={t} x={x} y={y} className={`map-label${t === "N" ? " north" : ""}`} textAnchor="middle">
              {t}
            </text>
          ))}
          <g className="north-arrow" transform="translate(62 62)" aria-hidden="true">
            <circle r={42} className="north-ring" />
            <path d="M0 -33 L12 0 L-12 0 Z" className="north-tip" />
            <path d="M0 33 L12 0 L-12 0 Z" className="north-tail" />
          </g>
          <g aria-hidden="true" transform={`translate(24 ${S - 30})`}>
            <line x1={0} y1={0} x2={bar.units} y2={0} className="scale-bar" />
            <line x1={0} y1={-8} x2={0} y2={8} className="scale-bar" />
            <line x1={bar.units} y1={-8} x2={bar.units} y2={8} className="scale-bar" />
            <text x={0} y={-14} className="scale-text">
              {bar.feet} ft
            </text>
          </g>
        </svg>
        <div className="map-zoom">
          <button type="button" aria-label="Zoom in" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            +
          </button>
          <button type="button" aria-label="Zoom out" disabled={step === ZOOM_STEPS.length - 1} onClick={() => setStep((s) => Math.min(ZOOM_STEPS.length - 1, s + 1))}>
            −
          </button>
        </div>
        {failed ? (
          <p className="satellite-empty muted">The satellite picture didn&apos;t load. Check the signal and open the map again.</p>
        ) : !ready && tilesLoaded.size === 0 && loadedUrl === null ? (
          <p className="satellite-empty muted" aria-live="polite">
            Loading the satellite picture…
          </p>
        ) : null}
      </div>
      <figcaption>
        <span role="status">
          {moving
            ? "Tap the middle of the house."
            : picked !== null
              ? `Front faces ${compassLabel(picked)}. Tap another side to change it.`
              : "Tap the side of the house the front door is on."}
        </span>
        <span className="row">
          <button type="button" className="linkish" onClick={() => setMoving((m) => !m)}>
            {moving ? "Cancel" : "The dot isn't on the house"}
          </button>
        </span>
        {props.compass ? (
          <div className="compass-box">
            {live.state === "on" ? (
              <>
                <span>
                  Phone points <strong>{live.heading !== null ? compassLabel(live.heading) : "…"}</strong>
                  {live.heading !== null ? ` (${Math.round(live.heading)}°)` : null}. Stand at the front door, back to the house, phone pointing at the street.
                </span>
                <span className="row">
                  <button
                    type="button"
                    disabled={live.heading === null}
                    onClick={() =>
                      live.heading !== null &&
                      onPick({ azimuth: snapToCompass(live.heading), source: "Phone compass, held by the tech at the front door facing the street", via: "compass" })
                    }
                  >
                    Use {live.heading !== null ? compassLabel(live.heading) : "this"}
                  </button>
                  <button type="button" className="linkish" onClick={live.stop}>
                    Stop compass
                  </button>
                </span>
              </>
            ) : (
              <span className="row">
                <button type="button" className="secondary" onClick={() => void live.start()}>
                  Use the phone compass
                </button>
                {live.state === "denied" ? <span className="muted fine">The phone didn&apos;t allow the compass. Use the map instead.</span> : null}
                {live.state === "none" ? <span className="muted fine">This device has no compass. Use the map instead.</span> : null}
              </span>
            )}
          </div>
        ) : null}
        <span className="fine muted">
          {streets.list.length
            ? "Blue dashed lines are streets. A paved strip behind the houses with no blue line is usually an alley. "
            : streets.failed
              ? "Street lines didn't load. "
              : null}
          Pinch or use + and − to zoom.
        </span>
        <span className="fine muted">
          {meta.credit}.{streets.list.length ? ` ${STREETS.credit}.` : ""} North is up. The dot is the address&apos;s point, which can sit off the house.
          {esriNote ? ` ${esriNote}` : ""}
        </span>
      </figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------------------------------------
// Streets round the point, from the server (ADR-045). A failure leaves the map without them.
// ------------------------------------------------------------------------------------------------

function useStreets(lat: number, lon: number) {
  const [list, setList] = useState<Street[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let gone = false;
    setList([]);
    setFailed(false);
    fetch(`/api/streets?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`, { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<{ streets?: Street[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        if (!gone) setList(Array.isArray(b.streets) ? b.streets : []);
      })
      .catch(() => {
        if (!gone) setFailed(true);
      });
    return () => {
      gone = true;
    };
  }, [lat, lon]);
  return { list, failed };
}

// ------------------------------------------------------------------------------------------------
// Phone compass. iOS asks for permission on a tap and gives webkitCompassHeading; Android gives an
// absolute alpha through "deviceorientationabsolute". A desktop has neither.
// ------------------------------------------------------------------------------------------------

type OrientationEventCtor = { requestPermission?: () => Promise<"granted" | "denied"> };

function useCompass() {
  const [state, setState] = useState<"off" | "on" | "denied" | "none">("off");
  const [heading, setHeading] = useState<number | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const smoothed = useRef<number | null>(null);

  const stop = () => {
    cleanup.current?.();
    cleanup.current = null;
    smoothed.current = null;
    setHeading(null);
    setState("off");
  };

  const start = async () => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      setState("none");
      return;
    }
    const Ctor = window.DeviceOrientationEvent as unknown as OrientationEventCtor;
    if (typeof Ctor.requestPermission === "function") {
      try {
        if ((await Ctor.requestPermission()) !== "granted") {
          setState("denied");
          return;
        }
      } catch {
        setState("denied");
        return;
      }
    }
    const onEvent = (e: Event) => {
      const o = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
      const h = headingFromOrientation(
        { alpha: o.alpha, absolute: o.absolute || e.type === "deviceorientationabsolute", webkitCompassHeading: o.webkitCompassHeading },
        window.screen?.orientation?.angle ?? 0,
      );
      if (h === null) return;
      // Ease toward the new reading along the short way round, so the number doesn't jitter.
      const prev = smoothed.current;
      const next = prev === null ? h : (prev + (((h - prev + 540) % 360) - 180) * 0.25 + 360) % 360;
      smoothed.current = next;
      setHeading(next);
    };
    const type = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(type, onEvent);
    cleanup.current = () => window.removeEventListener(type, onEvent);
    setState("on");
    // No reading after a few seconds means no compass (a desktop, or a phone without one).
    window.setTimeout(() => {
      if (smoothed.current === null && cleanup.current) {
        cleanup.current();
        cleanup.current = null;
        setState("none");
      }
    }, 3000);
  };

  useEffect(() => () => cleanup.current?.(), []);
  return { state, heading, start, stop };
}
