type CameraCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  zoom?: { max: number; min: number; step?: number };
};

type CameraConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string;
  zoom?: number;
};

const rearCameraPattern =
  /\b(back|rear|environment|trasera|posterior|traseira|arriere|ruck)\b/;
const frontCameraPattern = /\b(front|user|frontal|delantera|facetime)\b/;
const auxiliaryLensPattern =
  /\b(macro|micro|tele|telephoto|ultra[\s-]?wide|ultra[\s-]?angular|0[.,]5x|zoom)\b/;
const mainLensPattern = /\b(main|principal|standard|default|wide|1x)\b/;
const plainRearCameraPattern =
  /^(back|rear|environment|trasera|posterior|traseira) camera(?: \d+)?$/;

function normalizeCameraLabel(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function scoreQrCamera(device: MediaDeviceInfo, currentDeviceId?: string) {
  const label = normalizeCameraLabel(device.label);
  let score = device.deviceId === currentDeviceId ? 10 : 0;

  if (rearCameraPattern.test(label)) score += 80;
  if (frontCameraPattern.test(label)) score -= 120;
  if (auxiliaryLensPattern.test(label)) score -= 200;
  if (mainLensPattern.test(label)) score += 35;
  if (plainRearCameraPattern.test(label)) score += 120;

  return score;
}

export function selectQrCamera(
  devices: MediaDeviceInfo[],
  currentDeviceId?: string,
) {
  return devices
    .filter((device) => device.kind === "videoinput")
    .map((device, index) => ({
      device,
      index,
      score: scoreQrCamera(device, currentDeviceId),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]
    ?.device;
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

async function applyQrCameraSettings(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  if (!track) return;

  // Some mobile browsers expose a stream without the capabilities API.
  const capabilities = (track.getCapabilities?.() ?? {}) as CameraCapabilities;
  if (capabilities.focusMode?.includes("continuous")) {
    await track
      .applyConstraints({
        advanced: [{ focusMode: "continuous" } as CameraConstraintSet],
      })
      .catch(() => undefined);
  }

  if (capabilities.zoom) {
    const normalZoom = Math.min(
      capabilities.zoom.max,
      Math.max(capabilities.zoom.min, 1),
    );
    await track
      .applyConstraints({
        advanced: [{ zoom: normalZoom } as CameraConstraintSet],
      })
      .catch(() => undefined);
  }
}

const qrVideoConstraints: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1280 },
  height: { ideal: 960 },
  aspectRatio: { ideal: 4 / 3 },
};

export async function openQrCamera(deviceId?: string) {
  let stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: deviceId ? { width: qrVideoConstraints.width, height: qrVideoConstraints.height, deviceId: { exact: deviceId } } : qrVideoConstraints,
  });

  const currentDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId;
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  const preferredCamera = selectQrCamera(devices, currentDeviceId);

  if (!deviceId && preferredCamera && preferredCamera.deviceId !== currentDeviceId) {
    // Android devices often cannot open two rear lenses simultaneously.
    stopStream(stream);
    try {
      const preferredStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...qrVideoConstraints,
          deviceId: { exact: preferredCamera.deviceId },
        },
      });
      stream = preferredStream;
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: qrVideoConstraints });
    }
  }

  // Focus/zoom are best-effort enhancements, never a reason to lose a stream.
  await applyQrCameraSettings(stream).catch(() => undefined);
  return stream;
}
