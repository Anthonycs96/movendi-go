import assert from "node:assert/strict";
import test from "node:test";
import { openQrCamera, scoreQrCamera, selectQrCamera } from "./qr-camera";

function camera(deviceId: string, label: string) {
  return {
    deviceId,
    groupId: "group",
    kind: "videoinput",
    label,
    toJSON: () => ({}),
  } as MediaDeviceInfo;
}

test("prefers the main rear camera over macro, telephoto and front lenses", () => {
  const selected = selectQrCamera([
    camera("front", "Front Camera"),
    camera("macro", "Back Macro Camera"),
    camera("tele", "Back Telephoto Camera"),
    camera("main", "Back Camera"),
  ]);

  assert.equal(selected?.deviceId, "main");
});

test("keeps the environment-selected device when camera labels are generic", () => {
  const selected = selectQrCamera(
    [camera("first", "Camera 1"), camera("current", "Camera 2")],
    "current",
  );

  assert.equal(selected?.deviceId, "current");
});

test("penalizes auxiliary lenses even when they are rear-facing", () => {
  assert.ok(
    scoreQrCamera(camera("main", "Back Camera")) >
      scoreQrCamera(camera("macro", "Back Macro Camera")),
  );
});

for (const rejectsPreferred of [false, true]) {
  test(`releases the rear lens before switching and recovers when rejected: ${rejectsPreferred}`, async (context) => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    context.after(() => { if (descriptor) Object.defineProperty(navigator, "mediaDevices", descriptor); else Reflect.deleteProperty(navigator, "mediaDevices"); });
    let active = false;
    let calls = 0;
    const stopped: string[] = [];
    function stream(id: string) {
      active = true;
      const track = { getSettings: () => ({ deviceId: id }), stop: () => { active = false; stopped.push(id); } };
      return { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    }
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
      enumerateDevices: async () => [camera("macro", "Back Macro Camera"), camera("main", "Back Camera")],
      getUserMedia: async () => {
        calls += 1;
        assert.equal(active, false, "the previous camera must be released before opening another");
        if (calls === 2 && rejectsPreferred) throw new Error("Lens unavailable");
        return stream(calls === 1 ? "macro" : "main");
      },
    } });
    const result = await openQrCamera();
    assert.deepEqual(stopped, ["macro"]);
    assert.equal(calls, rejectsPreferred ? 3 : 2);
    assert.equal(result.getVideoTracks()[0].getSettings().deviceId, "main");
    result.getTracks().forEach((track) => track.stop());
  });
}

test("honors a manually selected lens even when camera labels favor another", async (context) => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  context.after(() => { if (descriptor) Object.defineProperty(navigator, "mediaDevices", descriptor); else Reflect.deleteProperty(navigator, "mediaDevices"); });
  let calls = 0;
  const track = { getSettings: () => ({ deviceId: "chosen" }), getCapabilities: () => { throw new Error("Unsupported"); }, stop: () => {} };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
    enumerateDevices: async () => [camera("main", "Back Camera"), camera("chosen", "Camera 2")],
    getUserMedia: async (constraints: MediaStreamConstraints) => {
      calls += 1;
      assert.deepEqual((constraints.video as MediaTrackConstraints).deviceId, { exact: "chosen" });
      assert.equal((constraints.video as MediaTrackConstraints).facingMode, undefined);
      return stream;
    },
  } });
  assert.equal(await openQrCamera("chosen"), stream);
  assert.equal(calls, 1);
});
