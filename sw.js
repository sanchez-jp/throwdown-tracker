const CACHE="throwdown-tracker-v25";
const FILES=[
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./brand-mark.svg",
  "./header-logo.png",
  "./apple-touch-icon.png",
  "./data/competitions/badajoz-elvas-2026.json"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(FILES))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith("throwdown-tracker-")&&key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  const isNavigation=request.mode==="navigate"||url.pathname.endsWith("/index.html")||url.pathname.endsWith("/");
  const isCompetitionConfig=url.pathname.includes("/data/competitions/")&&url.pathname.endsWith(".json");

  if(isNavigation){
    event.respondWith(
      fetch(request,{cache:"no-store"})
        .then(response=>{
          if(response.ok){
            const copy=response.clone();
            caches.open(CACHE).then(cache=>cache.put("./index.html",copy));
          }
          return response;
        })
        .catch(()=>caches.match("./index.html"))
    );
    return;
  }

  if(isCompetitionConfig){
    event.respondWith(
      fetch(request,{cache:"no-store"})
        .then(response=>{
          if(response.ok){
            const copy=response.clone();
            caches.open(CACHE).then(cache=>cache.put(request,copy));
          }
          return response;
        })
        .catch(()=>caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached=>{
      if(cached)return cached;
      return fetch(request).then(response=>{
        if(response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(request,copy));
        }
        return response;
      });
    })
  );
});
