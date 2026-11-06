"use client";
import { useEffect, useRef, useState } from "react";
import { IMAGERY, bearing, compassLabel, headingFromOrientation, pointToward, satelliteImageUrl, snapToCompass } from "../../../lib/imagery";

/**
 * The satellite map of the lot (ADR-043, ADR-044): north up, with north and the four compass
 * points marked, an arrow from the house for the front direction picked so far, and two ways to
 * set it without leaving the app: tap the side of the house the front door is on, or stand at the
 * front door with the phone pointing out to the street and use the phone's compass.
 */

const S = IMAGERY.px; // the map is drawn in a square of this many units
const MID = S / 2;

export type FrontPick = { azimuth: number; source: string; via: "map" | "compass" };

export function SatelliteMap(props: {
  lat: number;
  lon: number;
  /** The front direction picked so far (degrees, 0 = north), drawn as an arrow from the house. */
  value?: number | null | undefined;
  onPick: (p: FrontPick) => void;
  /** Show the phone compass button (on the Q5 map; not needed in House facts). */
  compass?: boolean;
}) {
  const { lat, lon, value, onPick } = props;
  const svg = useRef<SVGSVGElement>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Where the house is on the map: the record's point until the tech moves it onto the house.
  const [house, setHouse] = useState({ x: MID, y: MID });
  const [moving, setMoving] = useState(false);
  const [tapped, setTapped] = useState<{ x: number; y: number } | null>(null);
  const live = useCompass();
  const url = satelliteImageUrl(lat, lon);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
    setHouse({ x: MID, y: MID });
    setTapped(null);
  }, [url]);

  const tap = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svg.current || e.button > 0) return;
    const ctm = svg.current.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const pt = { x: Math.min(S, Math.max(0, p.x)), y: Math.min(S, Math.max(0, p.y)) };
    if (moving) {
      setHouse(pt);
      setTapped(null);
      setMoving(false);
      return;
    }
    if (Math.hypot(pt.x - house.x, pt.y - house.y) < 18) return; // a tap on the house itself says nothing
    setTapped(pt);
    onPick({
      azimuth: snapToCompass(bearing(house, pt)),
      source: `${IMAGERY.source}; front of the house tapped by the tech on the satellite map`,
      via: "map",
    });
  };

  const arrowLen = S * 0.3;
  const picked = typeof value === "number" ? value : null;
  const end = picked !== null ? pointToward(house, picked, arrowLen) : null;
  const liveEnd = live.heading !== null ? pointToward(house, live.heading, arrowLen * 0.8) : null;

  return (
    <figure className="satellite">
      <div className="satellite-frame">
        <svg
          ref={svg}
          viewBox={`0 0 ${S} ${S}`}
          role="img"
          aria-label={`Satellite map of the lot, north up${picked !== null ? `, front marked ${compassLabel(picked)}` : ""}`}
          onPointerUp={tap}
          style={{ cursor: "crosshair" }}
        >
          {!failed ? (
            <image href={url} x={0} y={0} width={S} height={S} preserveAspectRatio="none" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
          ) : null}
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
          {liveEnd ? <line x1={house.x} y1={house.y} x2={liveEnd.x} y2={liveEnd.y} className="pin-live" /> : null}
          {end ? (
            <g className="front-arrow">
              <line x1={house.x} y1={house.y} x2={end.x} y2={end.y} className="pin-line" />
              <circle cx={end.x} cy={end.y} r={26} className="pin-head" />
              <text x={end.x} y={end.y + 8} textAnchor="middle" className="pin-head-text">
                {compassLabel(picked!)}
              </text>
            </g>
          ) : null}
          {tapped && !end ? <circle cx={tapped.x} cy={tapped.y} r={9} className="pin-center" /> : null}
          <circle cx={house.x} cy={house.y} r={11} className="pin" />
        </svg>
        {failed ? (
          <p className="satellite-empty muted">The satellite picture didn&apos;t load. Check the signal and open the map again.</p>
        ) : !loaded ? (
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
          {IMAGERY.credit}. North is up. The dot is the address&apos;s point, which can sit off the house.
        </span>
      </figcaption>
    </figure>
  );
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
