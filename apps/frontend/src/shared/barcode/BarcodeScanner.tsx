"use client";
import { useEffect, useRef, useState } from "react";
import { ScanGate } from "./scan-gate";
import styles from "./BarcodeScanner.module.css";

const formats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
type NativeDetector = { detect: (video: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type NativeConstructor = { new(options: { formats: string[] }): NativeDetector; getSupportedFormats: () => Promise<string[]> };
type TorchConstraints = MediaTrackConstraintSet & { torch: boolean };

export function BarcodeScanner({ onScan, cooldownMs = 1200, disabled = false, label = "Escanear con cámara" }: { onScan: (code: string) => Promise<string | void> | string | void; cooldownMs?: number; disabled?: boolean; label?: string }) {
  const [active, setActive] = useState(false), [camera, setCamera] = useState("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]), [torch, setTorch] = useState(false), [canTorch, setCanTorch] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [code, setCode] = useState("");
  const [sound, setSound] = useState(false), [vibrate, setVibrate] = useState(false), [busy, setBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), reading = useRef(false);
  const callback = useRef(onScan), options = useRef({ sound, vibrate, disabled });
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => { callback.current = onScan; options.current = { sound, vibrate, disabled }; }, [onScan, sound, vibrate, disabled]);
  useEffect(() => () => { void audio.current?.close(); }, []);

  async function deliver(value: string) {
    if (reading.current || options.current.disabled) return;
    reading.current = true; setBusy(true); setError("");
    try {
      const result = await callback.current(value.trim());
      setMessage(result || `Código leído: ${value}`);
      if (options.current.vibrate) navigator.vibrate?.(60);
      if (options.current.sound && audio.current) {
        const oscillator = audio.current.createOscillator(), gain = audio.current.createGain();
        oscillator.frequency.value = 880; gain.gain.value = .06;
        oscillator.connect(gain); gain.connect(audio.current.destination); oscillator.start(); oscillator.stop(audio.current.currentTime + .1);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo consultar el código. Intenta nuevamente."); }
    finally { reading.current = false; setBusy(false); }
  }
  useEffect(() => { if (disabled) queueMicrotask(() => setActive(false)); }, [disabled]);
  const deliverRef = useRef(deliver);
  useEffect(() => { deliverRef.current = deliver; });

  useEffect(() => {
    if (!active || disabled) return;
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined, stopReader: (() => void) | undefined;
    let queue = Promise.resolve();
    const gate = new ScanGate(cooldownMs);
    const release = () => { stopped = true; clearTimeout(timer); stopReader?.(); stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; };
    const found = (value: string) => { if (!stopped && gate.accept(value, Date.now())) queue = queue.then(async () => { if (!stopped) await deliverRef.current(value); }); };
    async function start() {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("La cámara requiere una conexión HTTPS. Puedes ingresar el código manualmente.");
        const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: camera ? { deviceId: { exact: camera } } : { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } });
        if (stopped) { media.getTracks().forEach((track) => track.stop()); return; }
        stream.current = media;
        setCameras((await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput"));
        if (stopped || !video.current) return;
        setCanTorch(Boolean((media.getVideoTracks()[0]?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean })?.torch)); setTorch(false);
        const preview = video.current;
        preview.srcObject = media; await preview.play();
        if (stopped) return;
        const fallback = async () => {
          const { BrowserMultiFormatReader, BarcodeFormat } = await import("@zxing/browser");
          if (stopped) return;
          const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 120 });
          reader.possibleFormats = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128];
          const controls = await reader.decodeFromStream(media, preview, (result) => { if (result) found(result.getText()); });
          if (stopped) controls.stop(); else stopReader = () => controls.stop();
        };
        const Native = (window as unknown as { BarcodeDetector?: NativeConstructor }).BarcodeDetector;
        let detector: NativeDetector | null = null;
        try { const supported = Native ? await Native.getSupportedFormats() : []; if (Native && formats.every((format) => supported.includes(format))) detector = new Native({ formats }); } catch { /* ZXing below */ }
        async function scan() {
          if (stopped) return;
          try { for (const result of await detector!.detect(preview)) found(result.rawValue); }
          catch { try { await fallback(); } catch { setError("No se pudo iniciar el lector. Usa el ingreso manual."); release(); setActive(false); } return; }
          if (!stopped) timer = setTimeout(() => void scan(), 120);
        }
        if (detector) void scan(); else await fallback();
      } catch (cause) {
        if (stopped) return;
        const name = cause instanceof DOMException ? cause.name : "";
        setError(name === "NotAllowedError" ? "La cámara está bloqueada. Habilita el permiso en tu navegador o ingresa el código manualmente." : name === "NotFoundError" ? "No se encontró una cámara. Puedes ingresar el código manualmente." : name === "NotReadableError" ? "La cámara está ocupada por otra aplicación." : cause instanceof Error ? cause.message : "No se pudo iniciar la cámara.");
        release(); setActive(false);
      }
    }
    // Stop the device when the application is backgrounded.
    const hide = () => { if (document.hidden) { release(); setActive(false); } };
    document.addEventListener("visibilitychange", hide); void start();
    return () => { release(); document.removeEventListener("visibilitychange", hide); };
  }, [active, camera, cooldownMs, disabled]);

  return <div className={styles.scanner}>
    <div className={styles.controls}><button type="button" disabled={disabled} onClick={() => { setError(""); setActive(!active); }}>{active ? "Detener cámara" : label}</button>
      {active && cameras.length > 1 ? <label>Cámara<select value={camera} onChange={(event) => setCamera(event.target.value)}><option value="">Trasera automática</option>{cameras.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Cámara ${index + 1}`}</option>)}</select></label> : null}
      {active && canTorch ? <button type="button" onClick={async () => { try { await stream.current?.getVideoTracks()[0]?.applyConstraints({ advanced: [{ torch: !torch } as TorchConstraints] }); setTorch(!torch); } catch { setError("Este dispositivo no permite activar la linterna."); } }}>{torch ? "Apagar linterna" : "Linterna"}</button> : null}
    </div>
    {active ? <><div className={styles.preview}><video ref={video} muted playsInline autoPlay aria-label="Vista de la cámara para escanear" /><div className={styles.guide} /></div><small>Centra el código. Retíralo del encuadre antes de escanearlo otra vez.</small><div className={styles.controls}><label><input type="checkbox" checked={vibrate} onChange={(event) => setVibrate(event.target.checked)} />Vibrar</label><label><input type="checkbox" checked={sound} onChange={(event) => { setSound(event.target.checked); if (event.target.checked) { try { audio.current ??= new AudioContext(); void audio.current.resume().catch(() => setError("El navegador no permite reproducir sonido.")); } catch { setSound(false); setError("El navegador no permite reproducir sonido."); } } }} />Sonido</label></div></> : null}
    <div className={styles.manual}><label>Código manual<input value={code} maxLength={80} autoComplete="off" onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (code.trim()) void deliver(code); } }} /></label><button type="button" disabled={disabled || busy || !code.trim()} onClick={() => void deliver(code)}>Usar código</button></div>
    {message ? <p className={styles.message} aria-live="polite">{message}</p> : null}{error ? <p className={`${styles.message} ${styles.error}`} role="alert">{error}</p> : null}
  </div>;
}
