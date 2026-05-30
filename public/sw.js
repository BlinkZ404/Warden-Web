// Warden service worker: displays approval push notifications and routes a
// tap to the mobile approval screen.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Warden", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Warden";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "A fix is ready for your approval.",
      data: { url: data.url || "/dashboard" },
      badge: undefined,
      tag: data.url || "warden",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
