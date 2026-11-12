const CACHE="throwdown-tracker-v34";
const FILES=[
  "./",
  "./index.html",
  "./install-la-carlota.html",
  "./la-carlota/",
  "./la-carlota-2026/",
  "./la-carlota-2026/index.html",
  "./elvas-2026/",
  "./elvas-2026/index.html",
  "./la-carlota/index.html",
  "./manifest.webmanifest",
  "./manifests/wod-games-la-carlota-2026.webmanifest",
  "./manifests/badajoz-elvas-2026.webmanifest",
  "./icon.svg",
  "./brand-mark.svg",
  "./header-logo.png",
  "./apple-touch-icon.png",
  "./data/competitions/badajoz-elvas-2026.json",
  "./data/competitions/wod-games-la-carlota-2026.json"
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


self.addEventListener("push",event=>{
  let payload={};
  try{payload=event.data?event.data.json():{}}catch(_){payload={body:event.data?.text()||""}}
  const title=payload.title||"Briefing en 15 minutos";
  const options={
    body:payload.body||"El briefing está a punto de comenzar.",
    icon:"./apple-touch-icon.png",
    badge:"./apple-touch-icon.png",
    tag:payload.tag||"throwdown-briefing",
    renotify:false,
    data:{url:payload.url||"./"}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||"./",self.registration.scope).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for(const client of windows){
      if("focus"in client){
        await client.focus();
        if("navigate"in client)await client.navigate(target);
        return;
      }
    }
    if(self.clients.openWindow)await self.clients.openWindow(target);
  })());
});

function fetchFresh(request, ms) {
  if (!ms) return fetch(request, { cache: "no-store" });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { cache: "no-store", signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  const isNavigation=request.mode==="navigate"||url.pathname.endsWith("/index.html")||url.pathname.endsWith("/");
  const isCompetitionConfig=url.pathname.includes("/data/competitions/")&&url.pathname.endsWith(".json");

  if (isNavigation) {
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = (await cache.match(request)) || (await cache.match("./index.html"));
    try {
      // Con copia local: máximo 4 s de espera. Sin copia (primera visita): sin límite.
      const response = await fetchFresh(request, cached ? 4000 : 0);
      if (response.ok) {
        const rootPath = new URL("./", self.registration.scope).pathname;
        const isRoot = url.pathname === rootPath || url.pathname === rootPath + "index.html";
        // Los clones se crean AHORA, antes de devolver la respuesta.
        const forRequest = response.clone();
        const forIndex = isRoot ? response.clone() : null;
        event.waitUntil(Promise.all([
          cache.put(request, forRequest),
          forIndex ? cache.put("./index.html", forIndex) : Promise.resolve(),
        ]));
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })());
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
