/* Drive every console view through renderVals() with the mocks emptied.

   renderVals() is where all the per-screen value builders run (xVals, gVals,
   lVals, waVals, gpVals ...), so this exercises exactly the code that would
   crash on an empty dataset — index-into-[0], reduce-with-no-seed, NaN widths —
   without needing a browser.

   Run from the merchant-console directory. */
import { readFileSync } from "node:fs";
Error.stackTraceLimit = 40;

// --- minimal browser surface, enough for module top-level + renderVals ---
const store = new Map();
globalThis.window = {
  location: { origin: "http://localhost:3000", href: "http://localhost:3000/", pathname: "/" },
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {}, removeEventListener() {}, open() {}, setTimeout, clearTimeout,
};
globalThis.localStorage = globalThis.window.localStorage;
Object.defineProperty(globalThis, "navigator", {
  value: { clipboard: { writeText: async () => {} }, language: "en-GB", userAgent: "node" },
  configurable: true, writable: true,
});
globalThis.document = {
  documentElement: { setAttribute() {}, getAttribute: () => null, style: { setProperty() {} } },
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, getContext: () => null }),
  addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
  body: { appendChild() {}, removeChild() {}, style: {} },
};
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" });

const { default: Component } = await import("/home/joe/kazi/company/ELEMENTPAY/merchant-console/lib/logic.js");

const VIEWS = [
  "overview", "transactions", "wallets", "checkout", "plinks", "invoices", "embed",
  "catalog", "subs", "bens", "clients", "contacts", "reports", "keys", "devtools",
  "partners", "settings", "paybill", "otc", "xborder", "bulk", "remitters",
  "referral", "connect", "billing", "reference", "team",
];

/* Signed-in unverified merchant on sandbox with empty real feeds — the exact
   state a brand-new account lands in, and the one the mocks used to paper over. */
const BASE_STATE = {
  screen: "console", env: "sandbox", acct: "unverified", liveApproved: false,
  apiConnected: true, demoSandbox: false,
  realOrders: [], realLinks: [], realInvoices: [], realContacts: [], realApiKeys: [],
  realLogs: [], realEvents: [], realWebhooks: [], realNotifs: [], realTx: [],
  kyb: null, kybPeople: [], kybDocs: [], gt: {}, wa: {},
};

/* Start from the component's own constructor defaults so every field the view
   builders expect exists, then overlay the fresh-account scenario. */
const seed = new Component({});
const DEFAULTS = seed.state;

const inst = Object.create(Component.prototype);
inst.setState = function (patch) {
  const next = typeof patch === "function" ? patch(this.state) : patch;
  this.state = Object.assign({}, this.state, next);
};
inst.props = {};
inst.forceUpdate = () => {};

let failures = 0, checked = 0;
const findings = [];

for (const view of VIEWS) {
  inst.state = Object.assign({}, DEFAULTS, BASE_STATE, { view });
  let vals;
  try {
    vals = inst.renderVals();
    checked++;
  } catch (e) {
    failures++;
    console.log(`FAIL  ${view.padEnd(13)} ${e.constructor.name}: ${e.message}`);
    if (failures === 1) { Error.stackTraceLimit = 40; console.log(String(e.stack).split("\n").slice(0, 14).join("\n")); }
    continue;
  }
  // Scan the produced values for the tells of an empty-dataset bug.
  for (const [k, v] of Object.entries(vals)) {
    if (typeof v === "number" && !Number.isFinite(v)) findings.push(`${view}.${k} = ${v}`);
    if (typeof v === "string" && /NaN|Infinity|undefined%|\bundefined\b/.test(v)) {
      findings.push(`${view}.${k} = ${JSON.stringify(v.slice(0, 90))}`);
    }
  }
  console.log(`ok    ${view.padEnd(13)} ${Object.keys(vals).length} values`);
}

console.log(`\n${checked}/${VIEWS.length} views built, ${failures} threw`);
if (findings.length) {
  console.log(`\nNaN/Infinity/undefined leaked into ${findings.length} value(s):`);
  for (const f of findings.slice(0, 25)) console.log("  " + f);
} else {
  console.log("No NaN/Infinity/undefined leaked into any rendered value.");
}
process.exit(failures || findings.length ? 1 : 0);
