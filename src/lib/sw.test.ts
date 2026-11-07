/**
 * public/sw.js, run against fake caches and a fake network: what the game gets online and offline.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

const SOURCE = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://airhoops.test";

class FakeCache {
  entries = new Map<string, Response>();
  async match(req: Request | string, opts?: { ignoreSearch?: boolean }) {
    const url = new URL(typeof req === "string" ? req : req.url);
    const key = opts?.ignoreSearch ? url.origin + url.pathname : url.href;
    const hit = this.entries.get(key) ?? (opts?.ignoreSearch ? [...this.entries].find(([k]) => k.split("?")[0] === key)?.[1] : undefined);
    return hit?.clone();
  }
  async put(req: Request | string, res: Response) {
    this.entries.set(typeof req === "string" ? req : req.url, res);
  }
  async addAll(urls: string[]) {
    for (const u of urls) {
      const res = await net(new Request(ORIGIN + u));
      if (!res.ok) throw new Error("addAll failed");
      await this.put(ORIGIN + u, res);
    }
  }
}

let online = true;
let hits: string[] = [];
const stores = new Map<string, FakeCache>();
async function net(req: Request): Promise<Response> {
  hits.push(`${req.method} ${new URL(req.url).pathname}`);
  if (!online) throw new TypeError("Failed to fetch");
  const res = new Response(req.method === "HEAD" ? null : `body of ${new URL(req.url).pathname}`, { status: 200, headers: { "content-type": "text/plain" } });
  Object.defineProperty(res, "type", { value: "basic" });
  return res;
}

type Handler = (e: { request?: Request; respondWith?: (r: Promise<Response>) => void; waitUntil: (p: Promise<unknown>) => void }) => void;

function boot(version = "r1") {
  const handlers: Record<string, Handler> = {};
  const self = {
    location: { href: `${ORIGIN}/sw.js?v=${version}`, origin: ORIGIN },
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
    clients: { claim: async () => {} },
  };
  const caches = {
    open: async (name: string) => stores.get(name) ?? stores.set(name, new FakeCache()).get(name)!,
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  new Function("self", "caches", "fetch", "Response", "URL", SOURCE)(self, caches, net, Response, URL);

  const lifecycle = async (type: "install" | "activate") => {
    const waits: Promise<unknown>[] = [];
    handlers[type]({ waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  };
  /** Dispatches a fetch; null = the worker left it to the browser. */
  const get = async (path: string, init: RequestInit & { navigate?: boolean } = {}) => {
    const request = new Request(path.startsWith("http") ? path : ORIGIN + path, init);
    if (init.navigate) Object.defineProperty(request, "mode", { value: "navigate" });
    let out: Promise<Response> | null = null;
    const waits: Promise<unknown>[] = [];
    handlers.fetch({ request, respondWith: (r) => (out = r), waitUntil: (p) => waits.push(p) });
    const res = out ? await out : null;
    await Promise.all(waits);
    return res as Response | null;
  };
  return { lifecycle, get };
}

describe("service worker", () => {
  beforeEach(() => {
    online = true;
    hits = [];
    stores.clear();
  });

  it("plays offline once the game and the pose model have loaded online", async () => {
    const sw = boot();
    await sw.lifecycle("install");
    await sw.lifecycle("activate");
    await sw.get("/_next/static/chunks/app.js");
    await sw.get("/mediapipe/models/pose_landmarker_lite.task");
    await sw.get("/mediapipe/wasm/vision_wasm_internal.wasm");

    online = false;
    hits = [];
    expect(await (await sw.get("/play", { navigate: true }))!.text()).toBe("body of /play");
    expect(await (await sw.get("/_next/static/chunks/app.js"))!.text()).toBe("body of /_next/static/chunks/app.js");
    // The loader checks the model with HEAD before using it
    expect((await sw.get("/mediapipe/models/pose_landmarker_lite.task", { method: "HEAD" }))!.status).toBe(200);
    expect(await (await sw.get("/mediapipe/wasm/vision_wasm_internal.wasm"))!.text()).toContain("vision_wasm_internal.wasm");
    expect(hits.filter((h) => !h.startsWith("GET /play"))).toEqual([]); // all from the cache
  });

  it("falls back to the game, then to a short note, for pages never opened", async () => {
    const sw = boot();
    await sw.lifecycle("install");
    online = false;
    expect(await (await sw.get("/leaderboard", { navigate: true }))!.text()).toBe("body of /play");
    stores.clear();
    const res = (await sw.get("/leaderboard", { navigate: true }))!;
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("You're offline");
  });

  it("keeps one copy of a page whatever its query (challenge links)", async () => {
    const sw = boot();
    await sw.get("/play?vs=abc123", { navigate: true });
    online = false;
    expect(await (await sw.get("/play?vs=other", { navigate: true }))!.text()).toBe("body of /play");
  });

  it("serves pages from the network while online", async () => {
    const sw = boot();
    await sw.get("/profile", { navigate: true });
    await sw.get("/profile", { navigate: true });
    expect(hits.filter((h) => h === "GET /profile")).toHaveLength(2);
  });

  it("leaves the API, RSC fetches and posts alone", async () => {
    const sw = boot();
    expect(await sw.get("https://api.example.com/me/stats")).toBeNull();
    expect(await sw.get("/play?_rsc=x1")).toBeNull();
    expect(await sw.get("/play", { headers: { rsc: "1" } })).toBeNull();
    expect(await sw.get("/telemetry", { method: "POST", body: "{}" })).toBeNull();
  });

  it("drops an old release's caches but keeps the pose model", async () => {
    const old = boot("r1");
    await old.lifecycle("install");
    await old.get("/_next/static/chunks/app.js");
    await old.get("/mediapipe/models/pose_landmarker_lite.task");
    const next = boot("r2");
    await next.lifecycle("install");
    await next.lifecycle("activate");
    expect([...stores.keys()].sort()).toEqual(["airhoops-mediapipe-v1", "airhoops-pages-r2"]);
  });
});
