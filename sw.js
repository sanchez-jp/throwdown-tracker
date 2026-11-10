const CACHE="throwdown-tracker-v29";
const FILES=[
  "./",
  "./index.html",
  "./install-la-carlota.html",
  "./manifest.webmanifest",
  "./manifests/wod-games-la-carlota-2026.webmanifest",
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
            caches.open(CACHE).then(cache=>{
              cache.put(request,copy);
              if(url.pathname.endsWith("/")||url.pathname.endsWith("/index.html")){
                cache.put("./index.html",response.clone());
              }
            });
          }
          return response;
        })
        .catch(()=>caches.match(request).then(cached=>cached||caches.match("./index.html")))
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
