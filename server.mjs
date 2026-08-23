import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.LOOP_HEIST_PORT || 4173);
const hostFlagIndex = process.argv.findIndex((argument) => argument === "--host" || argument.startsWith("--host="));
let cliHost = "";

if (hostFlagIndex >= 0) {
  const argument = process.argv[hostFlagIndex];
  cliHost = argument.includes("=") ? argument.slice(argument.indexOf("=") + 1) : process.argv[hostFlagIndex + 1] || "";
  if (!cliHost || cliHost.startsWith("--")) {
    console.error("Usage: node server.mjs --host <hostname-or-address>");
    process.exit(1);
  }
}

const host = cliHost.trim() || process.env.LOOP_HEIST_HOST?.trim() || "127.0.0.1";
const root = process.cwd();
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid LOOP_HEIST_PORT: ${process.env.LOOP_HEIST_PORT}`);
  process.exit(1);
}

function getLanUrls() {
  const addresses = new Set();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      const isIpv4 = entry.family === "IPv4" || entry.family === 4;
      if (isIpv4 && !entry.internal) addresses.add(entry.address);
    }
  }
  return [...addresses].sort().map((address) => `http://${address}:${port}`);
}

const server = createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);
  const relative = normalize(requestPath === "/" ? "index.html" : requestPath.replace(/^[/\\]+/, ""));
  const filePath = join(root, relative);
  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": mime[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  if (host === "0.0.0.0") {
    console.log(`8초 도둑단 local: http://127.0.0.1:${port}`);
    const lanUrls = getLanUrls();
    if (lanUrls.length) {
      console.log("8초 도둑단 mobile/LAN URLs:");
      lanUrls.forEach((url) => console.log(`  ${url}`));
    } else {
      console.log(`8초 도둑단 mobile/LAN: http://<this-computer-ip>:${port}`);
    }
    console.log("Use only on a trusted local network.");
    return;
  }

  const urlHost = host.includes(":") ? `[${host}]` : host;
  console.log(`8초 도둑단 running at http://${urlHost}:${port}`);
});
