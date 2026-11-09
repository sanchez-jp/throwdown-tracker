const CACHE="throwdown-tracker-v22";
const FILES=["./","./index.html","./manifest.webmanifest","./icon.svg","./header-logo.png","./apple-touch-icon.png","./data/competitions/badajoz-elvas-2026.json"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const url=new URL(e.request.url);
  if(url.origin!==self.location.origin)return;
  if(e.request.mode==="navigate"||url.pathname.endsWith("/index.html")||url.pathname.endsWith("/")){
    e.respondWith(fetch(e.request,{cache:"no-store"}).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(c=>c.put("./index.html",copy));
      return res;
    }).catch(()=>caches.match("./index.html")));
    return;
  }
  if(url.pathname.includes("/data/competitions/")&&url.pathname.endsWith(".json")){
    e.respondWith(fetch(e.request,{cache:"no-store"}).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res}).catch(()=>caches.match(e.request))));
});
