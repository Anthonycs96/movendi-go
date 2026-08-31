import assert from "node:assert/strict";
import test from "node:test";
import { scoreQrCamera, selectQrCamera } from "./qr-camera";

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

