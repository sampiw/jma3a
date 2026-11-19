"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointer } from "react";
import Link from "next/link";
import { ChevronLeft, Crosshair, Radio, RefreshCw, Users, Volume2, VolumeX, Copy, LogOut, Gamepad2, Flag, Trophy, Signal, Maximize2 } from "lucide-react";
import { clamp, CLIP, idleInput, ROUNDS, TEAMS, type ArenaInput } from "@/games/paintball/arena";
import type { Snapshot } from "@/games/paintball/match";
import type { ArenaRenderer } from "./renderer";

type Credentials = { code: string; token: string };
type Result = { token?: string; snapshot?: Snapshot; error?: string };
const sessionKey = "jma3a.splat.player";
const maxPitch = 1.24;

async function api(body: object, signal?: AbortSignal) {
  const res = await fetch("/api/paintball", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), cache: "no-store", signal });
  return { data: await res.json() as Result, status: res.status };
}

function formatTime(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function Splat() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [touch, setTouch] = useState(false);
  const [muted, setMuted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [graphicsError, setGraphicsError] = useState(false);
  const [connection, setConnection] = useState(true);
  const [hit, setHit] = useState(false);
  const [hitBy, setHitBy] = useState(false);
  const [scoreboard, setScoreboard] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const scene = useRef<HTMLDivElement>(null);
  const map = useRef<HTMLCanvasElement>(null);
  const engine = useRef<ArenaRenderer | null>(null);
  const latest = useRef<Snapshot | null>(null);
  const input = useRef<ArenaInput>({ ...idleInput });
  const shotQueued = useRef(false);
  const keys = useRef(new Set<string>());
  const audio = useRef<AudioContext | null>(null);
  const mute = useRef(false);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const motion = useRef<{ id: number; x: number; y: number } | null>(null);
  const hitTimer = useRef<number | undefined>(undefined);
  const taggedTimer = useRef<number | undefined>(undefined);
  const acceptedShot = useRef(0);

  const playTone = useCallback((kind: "marker" | "tag" | "out") => {
    const ctx = audio.current;
    if (mute.current || !ctx || ctx.state !== "running") return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime; const length = kind === "marker" ? .085 : .21;
    oscillator.type = kind === "marker" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(kind === "tag" ? 680 : kind === "out" ? 250 : 180, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === "tag" ? 1040 : kind === "out" ? 70 : 64, now + length);
    gain.gain.setValueAtTime(.075, now); gain.gain.exponentialRampToValueAtTime(.001, now + length);
    oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(now + length);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }, []);

  function enableSound() {
    if (!window.AudioContext) return;
    audio.current ??= new AudioContext();
    void audio.current.resume().catch(() => {});
  }

  const update = useCallback((next: Snapshot, sentAt: number) => {
    const previous = latest.current;
    if (previous?.code === next.code && (next.version < previous.version || (next.version === previous.version && next.now < previous.now))) return;
    const fighter = next.players.find(p => p.id === next.self.id);
    const old = previous?.players.find(p => p.id === fighter?.id);
    const sameRound = previous?.round === next.round && previous?.phase === next.phase;
    if (sameRound && fighter && old && fighter.tags > old.tags) {
      setHit(true); playTone("tag"); window.clearTimeout(hitTimer.current);
      hitTimer.current = window.setTimeout(() => setHit(false), 360);
    }
    if (sameRound && fighter && old && fighter.outs > old.outs) {
      setHitBy(true); playTone("out"); window.clearTimeout(taggedTimer.current);
      taggedTimer.current = window.setTimeout(() => setHitBy(false), 740);
    }
    if (next.self.lastShot > acceptedShot.current) {
      acceptedShot.current = next.self.lastShot;
      if (sameRound && (!fighter || !old || fighter.tags === old.tags)) playTone("marker");
    }
    latest.current = next;
    engine.current?.sync(next, sentAt);
    setSnapshot(next);
  }, [playTone]);

  useEffect(() => {
    const coarse = window.matchMedia("(any-pointer: coarse)").matches;
    const low = coarse || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4);
    setTouch(coarse);
    const room = new URLSearchParams(location.search).get("room")?.toUpperCase().slice(0, 6) ?? "";
    setCode(room);
    try {
      const saved = JSON.parse(sessionStorage.getItem(sessionKey) ?? "null") as Credentials | null;
      if (saved?.code === room && saved.token) setCredentials(saved);
    } catch {}
    let stopped = false;
    void import("./renderer").then(({ ArenaRenderer }) => {
      if (stopped || !scene.current || !map.current) return;
      engine.current = new ArenaRenderer(scene.current, map.current, input.current, low);
      if (latest.current) engine.current.sync(latest.current, performance.now());
    }).catch(() => { if (!stopped) setGraphicsError(true); });
    return () => {
      stopped = true; engine.current?.close(); engine.current = null;
      window.clearTimeout(hitTimer.current); window.clearTimeout(taggedTimer.current);
      if (audio.current) { void audio.current.close(); audio.current = null; }
    };
  }, []);

  const resetControls = useCallback(() => {
    keys.current.clear(); input.current.right = input.current.forward = 0;
    input.current.fire = input.current.reload = shotQueued.current = false;
    drag.current = motion.current = null;
    setStick({ x: 0, y: 0 });
  }, []);

  const exitRoom = useCallback((reason = "") => {
    resetControls();
    if (document.pointerLockElement) document.exitPointerLock();
    engine.current?.reset(); latest.current = null; acceptedShot.current = 0;
    setCredentials(null); setSnapshot(null); setMessage(reason); setConnection(true); setScoreboard(false);
    try { sessionStorage.removeItem(sessionKey); } catch {}
    history.replaceState(null, "", location.pathname);
  }, [resetControls]);

  useEffect(() => {
    if (!credentials) return;
    const abort = new AbortController();
    let timer: number | undefined;
    let misses = 0;
    async function poll() {
      const sentAt = performance.now();
      const active = latest.current?.phase === "playing";
      const command = active && !document.hidden ? { ...input.current, fire: input.current.fire || shotQueued.current } : undefined;
      if (command) { shotQueued.current = false; input.current.reload = false; }
      try {
        const { data, status } = await api({ op: "sync", ...credentials, input: command }, abort.signal);
        if (abort.signal.aborted) return;
        if (status === 401 || status === 404) { exitRoom(data.error); return; }
        if (data.snapshot) { misses = 0; setConnection(true); update(data.snapshot, sentAt); }
        else misses++;
      } catch { if (!abort.signal.aborted) misses++; }
      if (misses > 2 && !abort.signal.aborted) setConnection(false);
      if (abort.signal.aborted) return;
      const play = latest.current?.phase === "playing" || latest.current?.phase === "break";
      const cadence = play && !document.hidden ? 207 : 950;
      timer = window.setTimeout(poll, Math.max(35, cadence - (performance.now() - sentAt)));
    }
    timer = window.setTimeout(poll, 80);
    return () => { abort.abort(); window.clearTimeout(timer); };
  }, [credentials, exitRoom, update]);

  useEffect(() => {
    const playable = () => latest.current?.phase === "playing";
    const move = () => {
      const held = keys.current;
      input.current.forward = Number(held.has("KeyW") || held.has("ArrowUp")) - Number(held.has("KeyS") || held.has("ArrowDown"));
      input.current.right = Number(held.has("KeyD") || held.has("ArrowRight")) - Number(held.has("KeyA") || held.has("ArrowLeft"));
    };
    const down = (e: KeyboardEvent) => {
      if (!playable() || e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault(); keys.current.add(e.code); move();
      } else if (e.code === "KeyR" || e.code === "Space" || e.code === "Tab") {
        if (e.code === "Tab" && !document.pointerLockElement) return;
        e.preventDefault();
        if (e.code === "KeyR" && !e.repeat) input.current.reload = true;
        if (e.code === "Space" && !e.repeat) { input.current.fire = shotQueued.current = true; engine.current?.trigger(); }
        if (e.code === "Tab") setScoreboard(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (keys.current.delete(e.code)) move();
      if (e.code === "Space") input.current.fire = false;
      if (e.code === "Tab") setScoreboard(false);
    };
    const look = (e: MouseEvent) => { if (playable() && document.pointerLockElement === scene.current) turn(e.movementX, e.movementY, .0027); };
    const release = () => { input.current.fire = false; };
    const lock = () => {
      const active = document.pointerLockElement === scene.current;
      setLocked(active);
      if (!active) resetControls();
    };
    const hidden = () => { if (document.hidden) resetControls(); };
    document.addEventListener("keydown", down); document.addEventListener("keyup", up); document.addEventListener("mousemove", look);
    document.addEventListener("pointerlockchange", lock); document.addEventListener("visibilitychange", hidden);
    window.addEventListener("mouseup", release); window.addEventListener("blur", resetControls);
    return () => {
      document.removeEventListener("keydown", down); document.removeEventListener("keyup", up); document.removeEventListener("mousemove", look);
      document.removeEventListener("pointerlockchange", lock); document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("mouseup", release); window.removeEventListener("blur", resetControls);
    };
  }, [resetControls]);

  useEffect(() => {
    if (snapshot?.phase !== "playing" && document.pointerLockElement) document.exitPointerLock();
    if (snapshot?.phase !== "playing") resetControls();
  }, [snapshot?.phase, resetControls]);

  function turn(dx: number, dy: number, scale: number) {
    const yaw = input.current.yaw - dx * scale;
    input.current.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    input.current.pitch = clamp(input.current.pitch - dy * scale, -maxPitch, maxPitch);
  }

  function lockMouse() {
    enableSound();
    const target = scene.current;
    const result = target?.requestPointerLock?.();
    if (result) void result.catch(() => setMessage("Click and drag in the arena to aim."));
  }

  function shoot() {
    enableSound();
    input.current.fire = shotQueued.current = true;
    engine.current?.trigger();
  }

  function lookStart(e: ReactPointer<HTMLDivElement>) {
    if (latest.current?.phase !== "playing" || e.button !== 0) return;
    if (e.pointerType === "mouse" && document.pointerLockElement === scene.current) { shoot(); return; }
    if (e.pointerType === "mouse") lockMouse();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }

  function lookMove(e: ReactPointer<HTMLDivElement>) {
    if (document.pointerLockElement || drag.current?.id !== e.pointerId) return;
    turn(e.clientX - drag.current.x, e.clientY - drag.current.y, .0055);
    drag.current.x = e.clientX; drag.current.y = e.clientY;
  }

  function lookEnd(e: ReactPointer<HTMLDivElement>) {
    if (drag.current?.id === e.pointerId) drag.current = null;
    if (e.pointerType === "mouse") input.current.fire = false;
  }

  function moveStart(e: ReactPointer<HTMLButtonElement>) {
    if (motion.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    motion.current = { id: e.pointerId, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    moveTouch(e);
  }

  function moveTouch(e: ReactPointer<HTMLButtonElement>) {
    if (motion.current?.id !== e.pointerId) return;
    const dx = e.clientX - motion.current.x, dy = e.clientY - motion.current.y;
    const max = Math.max(34, Math.hypot(dx, dy));
    input.current.right = dx / max; input.current.forward = -dy / max;
    setStick({ x: 31 * dx / max, y: 31 * dy / max });
  }

  function moveEnd(e: ReactPointer<HTMLButtonElement>) {
    if (motion.current?.id !== e.pointerId) return;
    motion.current = null; input.current.right = input.current.forward = 0; setStick({ x: 0, y: 0 });
  }

  async function connect(op: "create" | "join", e?: FormEvent) {
    e?.preventDefault();
    if (!name.trim() || busy) { setMessage("Enter your player name first."); return; }
    if (op === "join" && !/^[A-HJ-NP-Z2-9]{6}$/.test(code.trim())) { setMessage("Enter a six-character room code."); return; }
    enableSound(); setBusy(true); setMessage("");
    try {
      const { data } = await api({ op, name, code });
      if (!data.snapshot || !data.token) { setMessage(data.error ?? "Could not reach the arena."); return; }
      const session = { code: data.snapshot.code, token: data.token };
      try { sessionStorage.setItem(sessionKey, JSON.stringify(session)); } catch {}
      setCode(session.code);
      history.replaceState(null, "", `?room=${session.code}`);
      update(data.snapshot, performance.now()); setCredentials(session);
    } catch { setMessage("Could not reach matchmaking. Try again."); }
    finally { setBusy(false); }
  }

  async function start() {
    if (!credentials || busy) return;
    enableSound(); setBusy(true); setMessage("");
    try {
      const { data } = await api({ op: "start", ...credentials });
      if (data.snapshot) update(data.snapshot, performance.now());
      else setMessage(data.error ?? "Could not start the match.");
    } catch { setMessage("Could not start the match. Try again."); }
    finally { setBusy(false); }
  }

  function leave() {
    const prev = credentials;
    exitRoom();
    if (prev) void api({ op: "leave", ...prev }).catch(() => {});
  }

  async function copyInvite() {
    if (!snapshot) return;
    const invite = new URL(`/paintball?room=${snapshot.code}`, location.origin).href;
    try { await navigator.clipboard.writeText(invite); setCopied(true); }
    catch { setMessage(`Share this room code: ${snapshot.code}`); }
  }

  const phase = snapshot?.phase;
  const playing = phase === "playing";
  const me = snapshot?.players.find(p => p.id === snapshot.self.id);
  const host = Boolean(snapshot && snapshot.host === snapshot.self.id);
  const clock = snapshot ? formatTime(snapshot.endsAt - snapshot.now) : "5:00";
  const competitors = snapshot?.players.filter(p => p.online).length ?? 0;
  const winner = snapshot ? snapshot.total.cyan === snapshot.total.coral ? null : snapshot.total.cyan > snapshot.total.coral ? "cyan" : "coral" : null;
  const point = snapshot?.point;
  const reload = Boolean(snapshot?.self.reloadUntil);

  return <div className={`pb-shell${playing ? " pb-playing" : ""}`} dir="ltr" lang="en">
    <div ref={scene} className="pb-scene" aria-label="Splat 3D arena" onPointerDown={lookStart} onPointerMove={lookMove} onPointerUp={lookEnd} onPointerCancel={lookEnd} />
    <div className="pb-film" aria-hidden="true" />
    <header className="pb-head">
      <Link className="pb-back" href="/" aria-label="Back to JMA3A"><ChevronLeft size={19} /> <span>JMA3A</span></Link>
      <div className="pb-head-actions">
        {!connection && <div className="pb-link-status" role="status"><Signal size={15} /> Reconnecting</div>}
        <button className="pb-icon" type="button" aria-label={muted ? "Unmute" : "Mute"} onClick={() => { mute.current = !muted; setMuted(!muted); if (muted) enableSound(); }}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>
        {playing && <button className="pb-icon" type="button" aria-label="Toggle fullscreen" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {}); else void document.querySelector(".pb-shell")?.requestFullscreen?.().catch(() => {}); }}><Maximize2 size={18} /></button>}
        {credentials && <button className="pb-icon" type="button" aria-label="Leave arena room" onClick={leave}><LogOut size={18} /></button>}
      </div>
    </header>

    {graphicsError && <div className="pb-notice" role="alert">Your browser couldn’t start the 3D renderer. Enable hardware acceleration and reload.</div>}

    {!snapshot && <section className="pb-entry" aria-label="Enter a paintball match">
      <div className="pb-intro">
        <div className="pb-kicker"><span /> JMA3A PAINTBALL</div>
        <h1>SPLAT<span>3D</span></h1>
        <p className="pb-map-title">Medina After Dark</p>
        <p className="pb-copy">Tag the other team. Hold the beacon. Take back the medina.</p>
        <div className="pb-facts"><span><Users size={16} /> 2–8 players</span><span><Radio size={16} /> Live teams</span><span><Gamepad2 size={16} /> PC & mobile</span></div>
        <form className="pb-form" onSubmit={e => void connect("join", e)}>
          <label htmlFor="splat-name">Player name</label>
          <input id="splat-name" autoComplete="nickname" maxLength={20} value={name} onChange={e => setName(e.target.value)} placeholder="Your nickname" />
          <button type="button" className="pb-primary" disabled={busy || graphicsError || Boolean(credentials)} onClick={() => void connect("create")}><Crosshair size={19} /> Create private match</button>
          <div className="pb-join-row">
            <input aria-label="Six-character room code" spellCheck={false} autoCapitalize="characters" maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Room code" />
            <button className="pb-secondary" disabled={busy || graphicsError || Boolean(credentials)}>Join</button>
          </div>
          {message && <p className="pb-error" role="alert">{message}</p>}
          {credentials && <p className="pb-hint">Reconnecting to your room…</p>}
        </form>
      </div>
      <div className="pb-location"><div /><span>MEDINA AFTER DARK</span></div>
    </section>}

    {snapshot && phase === "lobby" && <div className="pb-center">
      <section className="pb-card pb-lobby">
        <div className="pb-kicker"><span /> MEDINA AFTER DARK</div>
        <h1>Match lobby</h1>
        <div className="pb-room">
          <div><span>Room code</span><strong>{snapshot.code}</strong></div>
          <button className="pb-secondary" onClick={() => void copyInvite()}><Copy size={16} /> {copied ? "Copied" : "Copy invite"}</button>
        </div>
        <div className="pb-roster">
          <div className="pb-roster-title"><Users size={16} /> {competitors} / 8 connected</div>
          {snapshot.players.filter(p => p.online).map(p => <div className="pb-person" key={p.id}>
            <span><i style={{ background: TEAMS[p.team].css }} /> {p.name}{p.id === snapshot.self.id && <small> You</small>}</span>
            <small>{snapshot.host === p.id ? "Host" : TEAMS[p.team].label}</small>
          </div>)}
        </div>
        {message && <p className="pb-error" role="alert">{message}</p>}
        {host ? <button className="pb-primary" disabled={busy || competitors < 2} onClick={() => void start()}><Crosshair size={19} /> Start match</button> : <p className="pb-hint">Waiting for the host to start.</p>}
        <p className="pb-hint">{competitors < 2 ? "Share your invite with at least one friend." : "Four five-minute rounds. Tags and beacon control earn team points."}</p>
      </section>
    </div>}

    {!playing && snapshot && (phase === "break" || phase === "finished") && <div className="pb-center">
      <section className="pb-card pb-results">
        <div className="pb-kicker"><span /> {phase === "break" ? `ROUND ${snapshot.round} COMPLETE` : "MATCH COMPLETE"}</div>
        <Trophy size={35} className="pb-trophy" />
        <h1>{phase === "break" ? "Switching sides" : winner ? `${TEAMS[winner].label} wins` : "Draw"}</h1>
        <div className="pb-total"><strong className="pb-cyan">{snapshot.total.cyan}</strong><span>–</span><strong className="pb-coral">{snapshot.total.coral}</strong></div>
        <div className="pb-rounds">{snapshot.rounds.map((s, i) => <div key={i}><small>Round {i + 1}</small><b>{s.cyan} – {s.coral}</b></div>)}</div>
        {phase === "break" ? <p className="pb-hint">Round {snapshot.round + 1} starts in {clock}</p> : <>
          <p className="pb-hint">Your match · {me?.tags ?? 0} tags · {me?.outs ?? 0} outs</p>
          {message && <p className="pb-error" role="alert">{message}</p>}
          {host ? <button className="pb-primary" disabled={busy || competitors < 2} onClick={() => void start()}><RefreshCw size={18} /> Rematch</button> : <p className="pb-hint">Waiting for the host to start a rematch.</p>}
        </>}
      </section>
    </div>}

    <canvas ref={map} className="pb-minimap" width={154} height={121} hidden={!playing} aria-label="Minimap of the arena and friendly players" />

    {snapshot && playing && <>
      <div className="pb-scoreboard" aria-label="Team scores">
        <div className="pb-team pb-cyan"><span>Cyan</span><strong>{snapshot.score.cyan}</strong></div>
        <div className="pb-clock"><small>ROUND {snapshot.round} / {ROUNDS}</small><b>{clock}</b></div>
        <div className="pb-team pb-coral"><span>Coral</span><strong>{snapshot.score.coral}</strong></div>
      </div>
      <div className={`pb-objective${point === "cyan" || point === "coral" ? ` pb-${point}` : ""}`}><Flag size={14} /> {point === "cyan" || point === "coral" ? `${TEAMS[point].label} holds beacon` : point === "contested" ? "Beacon contested" : "Capture the center beacon"}</div>
      <div className={`pb-crosshair${hit ? " pb-hit" : ""}`} aria-hidden="true"><i /><i /><i /><i /><b /></div>
      {hit && <div className="pb-hit-label" role="status">TAGGED +3</div>}
      {hitBy && <div className="pb-hit-flash" />}
      {me && me.respawnAt > snapshot.now && <div className="pb-respawn"><b>Splatted</b><span>Back in {Math.ceil((me.respawnAt - snapshot.now) / 1000)}s</span></div>}
      <div className="pb-ammo" style={{ "--team": me ? TEAMS[me.team].css : TEAMS.cyan.css } as React.CSSProperties}>
        <span>{reload ? "RELOADING" : `${TEAMS[me?.team ?? "cyan"].label.toUpperCase()} TEAM`}</span>
        <strong>{String(snapshot.self.ammo).padStart(2, "0")} <small>/ {CLIP}</small></strong>
        <div>{Array.from({ length: CLIP }, (_, i) => <i key={i} data-empty={i >= snapshot.self.ammo} />)}</div>
      </div>
      {!touch && <div className="pb-desktop-guide"><span><kbd>WASD</kbd> Move</span><span><kbd>R</kbd> Reload</span><span><kbd>Tab</kbd> Scores</span></div>}
      {!touch && !locked && !me?.respawnAt && <button className="pb-focus" onClick={lockMouse}><Crosshair size={18} /> Click to aim</button>}
      {!touch && !locked && message && <div className="pb-play-error" role="status">{message}</div>}
      <button className="pb-board-toggle pb-icon" aria-label="Show player scores" onClick={() => setScoreboard(!scoreboard)}><Users size={17} /></button>
      {scoreboard && <div className="pb-board pb-card"><h2>Player scores</h2><table><thead><tr><th>Player</th><th>Tags</th><th>Outs</th></tr></thead><tbody>{[...snapshot.players].sort((a, b) => b.tags - a.tags).map(p => <tr key={p.id}><th style={{ color: TEAMS[p.team].css }}>{p.name}</th><td>{p.tags}</td><td>{p.outs}</td></tr>)}</tbody></table></div>}
      {touch && <div className="pb-touch">
        <button className="pb-stick" aria-label="Move joystick" onPointerDown={moveStart} onPointerMove={moveTouch} onPointerUp={moveEnd} onPointerCancel={moveEnd} onLostPointerCapture={moveEnd}><span style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }} /></button>
        <div className="pb-fire-controls"><button className="pb-reload" aria-label="Reload" onPointerDown={() => { input.current.reload = true; }}><RefreshCw size={22} /></button>
          <button className="pb-fire" aria-label="Fire paintball marker" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); shoot(); }} onPointerUp={() => { input.current.fire = false; }} onPointerCancel={() => { input.current.fire = false; }} onLostPointerCapture={() => { input.current.fire = false; }}><Crosshair size={31} /><span>FIRE</span></button></div>
        <p className="pb-touch-hint">Drag to aim</p>
      </div>}
    </>}
  </div>;
}
