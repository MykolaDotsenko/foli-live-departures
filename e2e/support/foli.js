// The Föli API as the suite serves it: every data.foli.fi route a scenario can touch.
import { gtfsClockAt } from "./clock.js";

export function monitorPayload(stopId) {
  const now = Math.floor(Date.now() / 1000);
  const isMarket = stopId === "164";

  return {
    status: "OK",
    stopname: isMarket ? "Kauppatori" : "Turun linna",
    servertime: now,
    result: [
      {
        lineref: isMarket ? "1" : "8",
        destinationdisplay: isMarket ? "Satama" : "Kauppatori",
        destinationdisplay_en: isMarket ? "Harbour" : "Market Square",
        destinationdisplay_sv: isMarket ? "Hamnen" : "Salutorget",
        monitored: true,
        vehicleatstop: isMarket,
        __tripref: isMarket ? "trip-164-1" : "trip-4-8",
        delay: 35,
        recordedattime: now - 20,
        latitude: isMarket ? 60.4538 : 60.437,
        longitude: isMarket ? 22.2666 : 22.2345,
        expecteddeparturetime: now + 240,
        aimeddeparturetime: now + 205,
      },
      {
        lineref: isMarket ? "7" : "2",
        destinationdisplay: isMarket ? "Runosmäki" : "Satama",
        destinationdisplay_en: isMarket ? "" : "Harbour",
        destinationdisplay_sv: isMarket ? "Runosbacken" : "Hamnen",
        monitored: false,
        __tripref: isMarket ? "trip-164-7" : "trip-4-2",
        delay: null,
        aimeddeparturetime: now + 540,
      },
    ],
  };
}

export async function mockFoli(page) {
  await page.route("https://data.foli.fi/siri/sm", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        "164": { stop_name: "Kauppatori" },
        "4": { stop_name: "Turun linna" },
        "32": { stop_name: "Puistokatu" },
      }),
    });
  });

  await page.route("https://data.foli.fi/gtfs/", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        host: "data.foli.fi",
        gtfspath: "/gtfs/v0",
        latest: "20260920-120000",
      }),
    });
  });

  await page.route(
    "https://data.foli.fi/gtfs/v0/20260920-120000/stops",
    async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        "164": {
          stop_name: "Kauppatori",
          stop_lat: 60.4518,
          stop_lon: 22.2666,
        },
        "4": {
          stop_name: "Turun linna",
          stop_lat: 60.4355,
          stop_lon: 22.2345,
        },
        "32": {
          stop_name: "Puistokatu",
          stop_lat: 60.4488,
          stop_lon: 22.255,
        },
      }),
    });
    }
  );

  await page.route(
    "https://data.foli.fi/gtfs/v0/20260920-120000/routes",
    async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          route_id: "1",
          route_short_name: "1",
          route_long_name: "Satama-Kauppatori-Lentoasema",
          route_type: 3,
          route_color: "ffff00",
          route_text_color: "ffffff",
        },
        {
          route_id: "7",
          route_short_name: "7",
          route_long_name: "Keskusta-Runosmaki",
          route_type: 3,
          route_color: "007985",
          route_text_color: "ffffff",
        },
        {
          route_id: "8",
          route_short_name: "8",
          route_long_name: "Turun linna-Kauppatori",
          route_type: 3,
          route_color: "d20824",
          route_text_color: "ffffff",
        },
        {
          route_id: "99",
          route_short_name: "99",
          route_long_name: "Static-only test route",
          route_type: 3,
          route_color: "355c7d",
          route_text_color: "ffffff",
        },
        {
          route_id: "2",
          route_short_name: "2",
          route_long_name: "Test route",
          route_type: 3,
          route_color: "007985",
          route_text_color: "ffffff",
        },
      ]),
    });
    }
  );

  await page.route(
    "https://data.foli.fi/geojson/bounds/compact",
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "MultiPolygon",
                coordinates: [
                  [
                    [
                      [21.9, 60.3],
                      [22.6, 60.3],
                      [22.6, 60.7],
                      [21.9, 60.7],
                      [21.9, 60.3],
                    ],
                  ],
                ],
              },
            },
          ],
        }),
      });
    }
  );

  await page.route(
    /https:\/\/data\.foli\.fi\/gtfs\/v0\/20260920-120000\/stop_times\/stop\/(164|4|32)/,
    async (route) => {
      const stopId = route.request().url().split("/").pop();
      const data =
        stopId === "164"
          ? [
              { trip_id: "trip-164-1", pickup_type: 0 },
              { trip_id: "trip-164-99", pickup_type: 0 },
            ]
          : stopId === "4"
            ? [{ trip_id: "trip-4-8", pickup_type: 0 }]
            : [];
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    }
  );

  await page.route(
    /https:\/\/data\.foli\.fi\/gtfs\/v0\/20260920-120000\/trips\/route\/(1|99)/,
    async (route) => {
      const routeId = route.request().url().split("/").pop();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          routeId === "1"
            ? [{ trip_id: "trip-164-1" }]
            : [{ trip_id: "trip-164-99" }]
        ),
      });
    }
  );

  await page.route(
    /https:\/\/data\.foli\.fi\/gtfs\/v0\/20260920-120000\/trips\/trip\/(trip-164-1|trip-164-7|trip-4-8|trip-4-2)/,
    async (route) => {
      const tripId = route.request().url().split("/").pop();
      const wheelchair = tripId === "trip-164-7" ? 2 : 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            route_id: tripId.includes("-7") ? "7" : tripId.includes("-8") ? "8" : tripId.includes("-2") ? "2" : "1",
            service_id: "weekday",
            trip_headsign: tripId.includes("-7") ? "Runosmäki" : "Harbour",
            direction_id: 0,
            block_id: "block-1",
            shape_id: "shape-1",
            wheelchair_accessible: wheelchair,
            bikes_allowed: 0,
          },
        ]),
      });
    }
  );

  await page.route(
    "https://data.foli.fi/gtfs/v0/20260920-120000/stop_times/trip/trip-164-1",
    async (route) => {
      // Timed from the market-stop departure the board shows, so next stops
      // and screenshots read "around 20:17" beside a 20:12 bus, not 17:46.
      const at = gtfsClockAt(Math.floor(Date.now() / 1000) + 205);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            stop_id: "164",
            arrival_time: at(-60),
            departure_time: at(0),
            stop_sequence: 1,
            pickup_type: 0,
            drop_off_type: 0,
            timepoint: 1,
            shape_dist_traveled: 0,
          },
          {
            stop_id: "32",
            arrival_time: at(300),
            departure_time: at(300),
            stop_sequence: 2,
            pickup_type: 0,
            drop_off_type: 0,
            timepoint: 0,
            shape_dist_traveled: 900,
          },
          {
            stop_id: "4",
            arrival_time: at(840),
            departure_time: at(840),
            stop_sequence: 3,
            pickup_type: 0,
            drop_off_type: 0,
            timepoint: 1,
          },
        ]),
      });
    }
  );

  await page.route("https://data.foli.fi/media/detour.png", async (route) => {
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>',
    });
  });

  await page.route(/https:\/\/data\.foli\.fi\/siri\/sm\/(164|4|32)/, async (route) => {
    const stopId = route.request().url().split("/").pop();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(monitorPayload(stopId)),
    });
  });

  await page.route("https://data.foli.fi/alerts", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        servertime: Math.floor(Date.now() / 1000),
        global_message: {},
        emergency_message: {},
        messages: [
          {
            message_id: 21,
            isactive: true,
            priority: 900,
            effect: "DETOUR",
            cause: "CONSTRUCTION",
            affected_stops: [],
            affected_routes: ["1"],
            // Föli writes its notices in Finnish and translates them.
            header: "Linjan 1 poikkeusreitti keskustassa",
            message: "Linja 1 kulkee tilapäistä reittiä.",
            information: "Pysäkki 14 ei ole käytössä töiden aikana.",
            translations: {
              en: {
                header: "Line 1 city-centre detour",
                message: "Line 1 uses a temporary route.",
                information: "Stop 14 is not in use during the works.",
              },
            },
            repeat: [[
              Math.floor(Date.now() / 1000) - 60,
              Math.floor(Date.now() / 1000) + 3600,
            ]],
            images: [
              {
                url: "//data.foli.fi/media/detour.png",
                title: "Temporary detour map",
                type: "image/png",
              },
            ],
          },
          {
            message_id: 22,
            isactive: true,
            priority: 950,
            effect: "NO_SERVICE",
            affected_stops: [],
            affected_routes: ["99"],
            header: "Linjan 99 muutos",
            message: "Tällä reitillä ei ole nyt lähtöä.",
            translations: {
              en: {
                header: "Line 99 service change",
                message: "This route has no current departure row.",
              },
            },
          },
        ],
        cancellations: [],
      }),
    });
  });
}
