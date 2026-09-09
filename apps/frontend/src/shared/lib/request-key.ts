// getRandomValues also works on a trusted home LAN served over HTTP.
export function requestKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, "0")).join("");
}
