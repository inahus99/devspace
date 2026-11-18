// End-to-end API smoke test. Runs the core user journeys against a live server.
//   node scripts/smoke.mjs [baseUrl]     (default http://localhost:3000)
// Requires a fresh database (first account registers) or SMOKE_EMAIL/SMOKE_PASSWORD
// for an existing account. A second account is needed for the isolation check;
// it is created when registration is open, otherwise that check is skipped.
import assert from "node:assert/strict";

const BASE = process.argv[2] ?? "http://localhost:3000";
const today = new Date().toLocaleDateString("en-CA");

function client() {
  let cookie = "";
  return async function call(method, path, body, { raw = false, form } = {}) {
    const headers = { "x-local-date": today };
    if (cookie) headers.cookie = cookie;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, { method, headers, body: payload });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    if (raw) return res;
    const data = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
    if (!res.ok) throw Object.assign(new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data)}`), { status: res.status });
    return data;
  };
}

const step = (name) => console.log(`✓ ${name}`);
const api = client();

const email = process.env.SMOKE_EMAIL ?? `smoke-${Date.now()}@example.test`;
const password = process.env.SMOKE_PASSWORD ?? "correct-horse-battery";
try {
  await api("POST", "/api/auth/register", { email, password, displayName: "Smoke" });
} catch (e) {
  if (e.status !== 403 && e.status !== 409) throw e;
  await api("POST", "/api/auth/login", { email, password });
}
step("signed in");

// 1-2. Workspace + nested folders
const ws = await api("POST", "/api/workspaces", { name: "FastAPI", icon: "zap", color: "#22c55e" });
const dsaWs = await api("POST", "/api/workspaces", { name: "DSA", icon: "binary", kind: "dsa" });
const lldWs = await api("POST", "/api/workspaces", { name: "LLD", icon: "boxes", kind: "lld" });
const arrays = await api("POST", "/api/folders", { workspaceId: dsaWs.id, name: "Arrays" });
const twoPtr = await api("POST", "/api/folders", { workspaceId: dsaWs.id, parentId: arrays.id, name: "Two Pointers" });
const deep = await api("POST", "/api/folders", { workspaceId: dsaWs.id, parentId: twoPtr.id, name: "Variants" });
await assert.rejects(api("PATCH", `/api/folders/${arrays.id}`, { parentId: deep.id }), /inside itself/);
step("workspace + 3-level nested folders (cycle rejected)");

// 3-5. Note in nested folder + screenshot
const note = await api("POST", "/api/notes", {
  workspaceId: dsaWs.id, folderId: twoPtr.id, title: "Two pointer patterns",
  contentHtml: "<h2>Opposite ends</h2><p>Sorted input.</p>", plainText: "Opposite ends Sorted input.", tags: ["arrays", "Patterns"],
});
assert.deepEqual(note.tags, ["arrays", "patterns"]);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const form = new FormData();
form.append("noteId", note.id);
form.append("file", new Blob([png], { type: "image/png" }), "screenshot.png");
const img = await api("POST", "/api/attachments", undefined, { form });
assert.equal(img.kind, "image");
assert.equal(img.workspaceId, dsaWs.id);
await api("PATCH", `/api/notes/${note.id}`, { contentHtml: `<p><img src="${img.url}"></p>`, plainText: "" });
const fileRes = await api("GET", img.url, undefined, { raw: true });
assert.equal(fileRes.status, 200);
assert.equal(fileRes.headers.get("content-type"), "image/png");
const reread = await api("GET", `/api/notes/${note.id}`);
assert.ok(reread.contentHtml.includes(img.url));
step("note in nested folder + pasted screenshot persisted and served");

// 6. Snippet
const snip = await api("POST", "/api/snippets", { workspaceId: dsaWs.id, title: "Binary search", language: "python", code: "def bs(): pass", noteId: note.id });
assert.equal(snip.language, "python");
step("code snippet");

// 7. DSA problem + solution + revision
const prob = await api("POST", "/api/dsa/problems", { workspaceId: dsaWs.id, folderId: twoPtr.id, title: "Two Sum II", platform: "LeetCode", topic: "Two Pointers", difficulty: "medium", status: "solved", url: "https://leetcode.com/problems/two-sum-ii" });
assert.equal(prob.solvedOn, today);
assert.ok(prob.nextReviewOn > today);
await api("POST", "/api/dsa/solutions", { problemId: prob.id, language: "cpp", code: "int main(){}" });
await api("POST", "/api/dsa/solutions", { problemId: prob.id, language: "java", code: "class S{}" });
const sols = await api("GET", `/api/dsa/problems/${prob.id}/solutions`);
assert.equal(sols.length, 2);
const reviewed = await api("POST", `/api/dsa/problems/${prob.id}/review`, { date: today, success: false });
assert.equal(reviewed.status, "needs_revision");
const due = await api("GET", `/api/dsa/problems?due=1`);
assert.ok(due.some((p) => p.id === prob.id));
step("DSA problem, 2 solutions, revision queue");

// 8. LLD exercise with screenshots
const lld = await api("POST", "/api/lld", { workspaceId: lldWs.id, title: "Parking lot", designPatterns: ["Strategy", "Factory"], solidPrinciples: ["S", "O"] });
for (const name of ["class-diagram.png", "sequence.png"]) {
  const f = new FormData();
  f.append("lldExerciseId", lld.id);
  f.append("label", "UML");
  f.append("file", new Blob([png], { type: "image/png" }), name);
  await api("POST", "/api/attachments", undefined, { form: f });
}
const lldFiles = await api("GET", `/api/attachments?lldExerciseId=${lld.id}`);
assert.equal(lldFiles.length, 2);
step("LLD exercise with 2 screenshots");

// 9-10. Resource in workspace appears in library (same record)
const yt = await api("POST", "/api/resources", { workspaceId: ws.id, title: "FastAPI course", url: "https://www.youtube.com/watch?v=abc123" });
assert.equal(yt.type, "youtube");
const library = await api("GET", "/api/resources");
assert.equal(library.filter((r) => r.id === yt.id).length, 1);
step("YouTube resource in FastAPI shows once in central library");

// 11-14. Activity → calendar → dashboard
const act = await api("POST", "/api/activities", { workspaceId: dsaWs.id, title: "Solve 2 problems", date: today, startTime: "09:00", endTime: "10:00", dsaProblemId: prob.id });
assert.equal(act.plannedMinutes, 60);
const overlap = await api("POST", "/api/activities", { workspaceId: ws.id, title: "Watch lecture", date: today, startTime: "09:30", endTime: "10:30" });
const done = await api("PATCH", `/api/activities/${act.id}`, { completed: true });
assert.equal(done.actualMinutes, 60);
await api("PATCH", `/api/activities/${overlap.id}`, { completed: true });
const cal = await api("GET", `/api/activities?from=${today}&to=${today}`);
assert.equal(cal.length, 2);
assert.equal(cal.find((a) => a.id === act.id).link.title, "Two Sum II");
const dash = await api("GET", "/api/insights/dashboard");
assert.equal(dash.todayActivities.length, 2);
assert.equal(dash.totalCompletedActivities, 2);
const stats = await api("GET", `/api/insights/stats?from=${today}&to=${today}`);
assert.equal(stats.totals.actualMinutes, 90, "overlapping 09:00-10:00 and 09:30-10:30 must count 90 minutes, not 120");
assert.equal(stats.streak.current, 1);
step("activities: calendar, dashboard, overlap-safe stats (90 min), streak");

// 15-16. Book progress → analytics
const book = await api("POST", "/api/books", { title: "Designing Data-Intensive Applications", author: "Martin Kleppmann", totalPages: 600 });
const b1 = await api("POST", `/api/books/${book.id}/progress`, { currentPage: 120, date: today });
assert.equal(b1.status, "reading");
const stats2 = await api("GET", `/api/insights/stats?from=${today}&to=${today}`);
assert.equal(stats2.reading.pagesInRange, 120);
assert.equal(stats2.dsa.total, 1);
step("book progress logged and reflected in analytics");

// Search
const found = await api("GET", "/api/search?q=two");
assert.ok(found.some((r) => r.type === "note") && found.some((r) => r.type === "dsa") && found.some((r) => r.type === "folder"));
step("global search");

// 17. Exports
for (const path of ["/api/export/backup.json", "/api/export/activities.csv", "/api/export/dsa.csv", "/api/export/dsa.json", "/api/export/books.csv", `/api/export/notes/${note.id}`, `/api/export/snippets/${snip.id}`, "/api/export/notes.zip", "/api/export/archive.zip"]) {
  const r = await api("GET", path, undefined, { raw: true });
  assert.equal(r.status, 200, path);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.ok(buf.length > 0, `${path} is empty`);
  if (path.endsWith(".zip")) assert.equal(buf.subarray(0, 2).toString(), "PK");
}
const md = await (await api("GET", `/api/export/notes/${note.id}`, undefined, { raw: true })).text();
assert.ok(md.startsWith("---") && md.includes("# Two pointer patterns"));
step("exports: JSON backup, CSVs, Markdown, source files, zips");

// Isolation: a second account cannot see or reference the first account's data.
const other = client();
let otherReady = true;
try {
  await other("POST", "/api/auth/register", { email: `other-${Date.now()}@example.test`, password });
} catch (e) {
  if (e.status === 403) otherReady = false;
  else throw e;
}
if (otherReady) {
  await assert.rejects(other("GET", `/api/notes/${note.id}`), /404/);
  await assert.rejects(other("POST", "/api/notes", { workspaceId: dsaWs.id }), /Workspace not found/);
  await assert.rejects(other("GET", img.url), /404/);
  assert.equal((await other("GET", "/api/notes")).length, 0);
  step("multi-user isolation");
} else {
  console.log("- skipped isolation check (registration closed)");
}

// Delete cascade + storage cleanup
await api("DELETE", `/api/workspaces/${lldWs.id}`);
await assert.rejects(api("GET", `/api/lld/${lld.id}`), /404/);
step("workspace delete cascades");

console.log("\nAll smoke checks passed.");
