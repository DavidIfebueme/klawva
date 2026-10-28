#!/usr/bin/env node
// loopback a2a adapter. the supervisor spawns this with a port and a single-use
// nonce; every task comes in on 127.0.0.1 and must quote the nonce on the first call.
import { createServer } from "node:http";

const port = Number(process.env.KLAWVA_A2A_PORT ?? "0");
const nonce = process.env.KLAWVA_A2A_NONCE ?? "";
const transport = process.env.KLAWVA_A2A_TRANSPORT ?? "";

if (port === 0 || nonce.length < 32 || transport !== "a2a-loopback") {
  console.error("adapter: missing port, nonce or transport from the supervisor");
  process.exit(2);
}

let seenNonce = false;

const runTask = async (brief) => ({
  outcome: "partial",
  summary: `reference adapter accepted a task: ${String(brief?.task ?? "untitled")}. wire the clicky core here.`,
  stats: [{ label: "adapter", value: "reference" }],
  evidence: [],
  limitations: ["reference adapter does not control the screen yet"],
});

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || !request.url?.startsWith("/message:stream")) {
    response.writeHead(404).end();
    return;
  }
  const presented = request.headers["x-klawva-nonce"];
  if (!seenNonce) {
    if (presented !== nonce) {
      response.writeHead(401).end("nonce");
      return;
    }
    seenNonce = true;
  }
  let raw = "";
  for await (const chunk of request) raw += chunk;
  let body = {};
  try {
    body = JSON.parse(raw);
  } catch {
    response.writeHead(400).end("json");
    return;
  }
  const artifact = await runTask(body?.klawva?.brief);
  response.writeHead(200, { "content-type": "text/event-stream" });
  response.write(`event: task\ndata: ${JSON.stringify({ task: { id: "local", status: { state: "TASK_STATE_WORKING" } } })}\n\n`);
  response.write(`event: artifact\ndata: ${JSON.stringify({ artifactUpdate: { artifact: { parts: [{ text: JSON.stringify(artifact) }] } } })}\n\n`);
  response.end(`event: status\ndata: ${JSON.stringify({ statusUpdate: { status: { state: "TASK_STATE_COMPLETED" } } })}\n\n`);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`klawva-handshake nonce=${nonce} port=${port}`);
});
