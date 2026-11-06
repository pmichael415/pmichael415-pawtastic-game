// Lovable's surgical owner-save / owner-bridge hooks, kept byte-for-byte as Lovable shipped them in the
// Graduation repo (main 8b5e0a8, public/play/index.html; see its AGENTS.md: "The static game exposes only surgical
// save/owner-bridge hooks"). Lovable edited the BUILT page by hand. esbuild's minifier cannot print those exact
// bytes from any source (it writes true as !0 and false as !1, merges adjacent lets, turns if(a)b() into a&&b()),
// so tools/build-single.mjs splices them into the bundle verbatim, right after esbuild runs:
//   - `from` is esbuild's output for this repo's source and must occur exactly once in the bundle, so a source
//     change under a hook stops the build (update the hook here) instead of silently dropping Lovable's code;
//   - `to` is Lovable's exact text.
// The page's <meta name="pawtastic-owner-save-client" content="2"> is in index.html.
// The modules the hooks load, /owner-save-client.js and /owner-bridge.js, live only in the Graduation repo
// (public/). tools/mock-owner/ holds small stand-ins so the mock server can boot the built page.
// Generated from the two built pages (Graduation 7059416 -> 8b5e0a8); do not hand-edit the strings.
// Bundle-level names the hooks use without an anchor: SESSION_KEY, MEASURE_KEY, STORAGE_KEYS (checked below).

export const OWNER_HOOKS = Object.freeze([
  {
    name: "pay-api-event-and-account-doc",
    // src/net/pay-api.js: analytics opt-out on pay.event; accountStore(doc) takes the owner-save v2 doc; saveCall + accountIdentity for it
    from: "signedIn:!1}),event:body=>call(\"POST\",\"/api/public/game/event\",body,{signedIn:!1}),staffReport:(days=7)=>call(\"GET\",`/api/public/game/staff/report?days=${encodeURIComponent(days)}`),accountStore(){let doc={async get(){let r=await call(\"GET\",\"/api/public/game/save\");if(!r.ok)throw new Error(r.error);return{exists:!!r.exists&&r.data!=null,data:()=>r.data}},async set(value){let r=await call(\"PUT\",\"/api/public/game/save\",{data:value});if(!r.ok)throw new Error(r.error)}};return{async use(name){return name===\"db\"?{doc:()=>doc}:name===\"user\"?{id:async()=>session?.user_id??session?.email??null}:null}}}}}function pendingCheckout(store=globalThis.sessionStorage,",
    to: "signedIn:!1}),event:body=>ownerAnalyticsAllowed()?call(\"POST\",\"/api/public/game/event\",body,{signedIn:!1}):Promise.resolve({ok:true}),staffReport:(days=7)=>call(\"GET\",`/api/public/game/staff/report?days=${encodeURIComponent(days)}`),accountStore(doc){return{async use(name){return name===\"db\"?{doc:()=>doc}:name===\"user\"?{id:async()=>session?.user_id??session?.email??null}:null}}},saveCall:(method,path,body)=>call(method,path,body),accountIdentity:()=>session?.user_id}}function pendingCheckout(store=globalThis.sessionStorage,",
  },
  {
    name: "saved-game-force-account",
    // src/backend/saved-game.js: an explicit "Use account save" (snap.forceAccount) wins over the device copy
    from: "theirs=snap.exists?snap.data():null;linked=!0,theirs?.wallet&&(provisional||!hadLocal||(theirs.at??0)>at)?(write2(stores.wallet,theirs.wallet),theirs.jar&&write2(stores.jar,",
    to: "theirs=snap.exists?snap.data():null;linked=!0,theirs?.wallet&&(snap.forceAccount||provisional||!hadLocal||(theirs.at??0)>at)?(write2(stores.wallet,theirs.wallet),theirs.jar&&write2(stores.jar,",
  },
  {
    name: "main-boot-owner-save",
    // src/main.js bootLocal: ownerAnalyticsAllowed(); load /owner-save-client.js; per-account (mode:user) save keys, copied once from the old keys; beacon honours opt-out
    from: "storagePersistent},screens)};async function bootLocal(){let base=apiBase(),pay=freePlay?await openPayments(base?{base,redirectPath:\"/graduation\"}:{}):null;pay&&document.documentElement.classList.add(\"server-on\");let checkoutReturn=pay?readCheckoutReturn():{checkout:null,sessionId:null},saved=await openSavedGame({claude:window.claude??(pay?.signedIn?pay.accountStore():void 0),now,stores:{wallet:createLocalStorage(STORAGE_KEYS.wallet),jar:createLocalStorage(STORAGE_KEYS.jar)},stamp:createLocalStorage(\"pawtastic-gd-saved-at-v1\")}),wallet=createWallet({storage:saved.stores.wallet,now}),jar=createJar({storage:saved.stores.jar,now,rng:createRng(Date.now()>>>0),odds}),measure=pay?createMeasure({send:pay.event,device:deviceId(createLocalStorage(DEVICE_KEY)),store:createLocalStorage(MEASURE_KEY),embed:!!base,beacon:body=>navigator.sendBeacon?.(base+EVENT_PATH,new Blob([JSON.stringify(body)],{type:\"application/json\"}))}",
    to: "storagePersistent},screens)};function ownerAnalyticsAllowed(){try{return navigator.doNotTrack!==\"1\"&&navigator.globalPrivacyControl!==true&&![\"1\",\"true\"].includes(localStorage.getItem(\"pawtastic-gd-analytics-opt-out\"))&&!JSON.parse(localStorage.getItem(MEASURE_KEY)||\"null\")?.optOut&&document.querySelector('meta[name=\"pawtastic-analytics\"]')?.content!==\"off\"}catch{return false}}async function bootLocal(){let base=apiBase(),pay=freePlay?await openPayments(base?{base,redirectPath:\"/graduation\"}:{}):null;let ownerClient=await import(\"/owner-save-client.js\"),accountDoc=pay?.signedIn?ownerClient.createAccountDoc({call:pay.saveCall,identity:pay.accountIdentity,storage:localStorage,mode:pay.mode}):null;pay&&document.documentElement.classList.add(\"server-on\");if(pay?.signedIn){let uid=JSON.parse(localStorage.getItem(SESSION_KEY)||\"null\")?.user_id;for(let key of[STORAGE_KEYS.wallet,STORAGE_KEYS.jar,\"pawtastic-gd-saved-at-v1\"]){let scoped=`${key}:${pay.mode}:${uid}`;if(localStorage.getItem(scoped)===null&&localStorage.getItem(key)!==null)localStorage.setItem(scoped,localStorage.getItem(key))}}let checkoutReturn=pay?readCheckoutReturn():{checkout:null,sessionId:null},saved=await openSavedGame({claude:window.claude??(pay?.signedIn?pay.accountStore(accountDoc):void 0),now,stores:{wallet:createLocalStorage(pay?.signedIn?`${STORAGE_KEYS.wallet}:${pay.mode}:${JSON.parse(localStorage.getItem(SESSION_KEY)||\"null\")?.user_id}`:STORAGE_KEYS.wallet),jar:createLocalStorage(pay?.signedIn?`${STORAGE_KEYS.jar}:${pay.mode}:${JSON.parse(localStorage.getItem(SESSION_KEY)||\"null\")?.user_id}`:STORAGE_KEYS.jar)},stamp:createLocalStorage(pay?.signedIn?`pawtastic-gd-saved-at-v1:${pay.mode}:${JSON.parse(localStorage.getItem(SESSION_KEY)||\"null\")?.user_id}`:\"pawtastic-gd-saved-at-v1\")}),wallet=createWallet({storage:saved.stores.wallet,now}),jar=createJar({storage:saved.stores.jar,now,rng:createRng(Date.now()>>>0),odds}),measure=pay?createMeasure({send:pay.event,device:deviceId(createLocalStorage(DEVICE_KEY)),store:createLocalStorage(MEASURE_KEY),embed:!!base,beacon:body=>ownerAnalyticsAllowed()&&navigator.sendBeacon?.(base+EVENT_PATH,new Blob([JSON.stringify(body)],{type:\"application/json\"}))}",
  },
  {
    name: "main-boot-owner-bridge",
    // src/main.js bootLocal: the player counter honours opt-out; load /owner-bridge.js (owner entry, grant checks)
    from: "pay&&openBeatLink(app).catch(()=>{}),pay&&startPlayerCount({store:createLocalStorage(DEVICE_KEY),base})}async function bootServerMode(){startApp({",
    to: "pay&&openBeatLink(app).catch(()=>{}),pay&&ownerAnalyticsAllowed()&&startPlayerCount({store:createLocalStorage(DEVICE_KEY),base});import(\"/owner-bridge.js\").then(m=>m.connectOwner({pay,base,storage:localStorage,accountDoc})).catch(()=>{})}async function bootServerMode(){startApp({",
  },
]);

// Names the hooks reference that esbuild could rename if another module ever declared the same top-level name.
const BINDINGS = ['SESSION_KEY', 'MEASURE_KEY', 'STORAGE_KEYS'];

export function applyOwnerHooks(js) {
  let out = js;
  for (const h of OWNER_HOOKS) {
    const n = out.split(h.from).length - 1;
    if (n !== 1) throw new Error(`owner hook ${h.name}: its anchor occurs ${n} times in the bundle (must be exactly 1); the source under it changed, update tools/owner-hooks.mjs`);
    out = out.replace(h.from, () => h.to);
  }
  for (const name of BINDINGS) {
    if (!new RegExp(`[,; ]${name}=`).test(out) || new RegExp(`\\b${name}\\d+\\b`).test(out))
      throw new Error(`owner hook binding ${name} is missing or renamed in the bundle`);
  }
  return out;
}
