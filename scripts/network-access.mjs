import { networkInterfaces } from "node:os";

function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

export function getLanIpv4Addresses() {
  const candidates = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const entry of addresses ?? []) {
      const ipv4 = entry.family === "IPv4" || entry.family === 4;
      if (!ipv4 || entry.internal || !isPrivateIpv4(entry.address)) continue;
      const priority = /wi-?fi|wlan|wireless/i.test(name) ? 0 : /ethernet|lan/i.test(name) ? 1 : 2;
      candidates.push({ address: entry.address, name, priority });
    }
  }
  return [...new Map(candidates.sort((a, b) => a.priority - b.priority).map((item) => [item.address, item])).values()];
}

export function printNetworkAccess({ appName, port, network }) {
  const label = appName === "frontend" ? "Frontend" : "Backend";
  console.log(`\n=== Movendi ${label} ===`);
  console.log(`Local:   http://localhost:${port}`);

  if (!network) {
    console.log("Red:     desactivada (solo este equipo)");
    return;
  }

  const addresses = getLanIpv4Addresses();
  if (!addresses.length) {
    console.log("Red:     no se encontró una IPv4 privada activa");
    return;
  }

  for (const item of addresses) console.log(`Red (${item.name}): http://${item.address}:${port}`);
  const primary = addresses[0].address;
  if (appName === "frontend") {
    console.log(`App:     http://${primary}:${port}`);
    console.log(`Acceso:  http://${primary}:${port}/login`);
  } else {
    console.log(`Salud:   http://${primary}:${port}/api/health`);
  }
  console.log("Nota: 0.0.0.0 es la dirección de escucha; usa la IP mostrada arriba.");
}
