import { options, transfers } from "./runtime.js";

/** @import { Dictionary } from "../index" */

/** @type {Dictionary} */
export default {
  "Location access is blocked. Allow location for this site in your browser settings and try again.":
    "Åtkomst till position är blockerad. Tillåt position för den här webbplatsen i webbläsarens inställningar och försök igen.",
  "Your device could not determine its location. Check location services and try again.":
    "Enheten kunde inte fastställa din position. Kontrollera positionstjänsterna och försök igen.",
  "Location took too long to respond. Move near a window or try again.":
    "Det tog för lång tid att få din position. Gå närmare ett fönster eller försök igen.",
  "Your location could not be read. Try again or choose a stop manually.":
    "Din position kunde inte läsas. Försök igen eller välj en hållplats manuellt.",
  "This browser does not support location access.":
    "Den här webbläsaren stöder inte åtkomst till position.",

  "Your location is too approximate{accuracy} to pick a stop for you. Search by name, or try again outdoors.":
    "Din position är för ungefärlig{accuracy} för att välja en hållplats åt dig. Sök med namn eller försök igen utomhus.",
  "You appear to be outside the Föli area, so no stop was filled in. Search by name instead.":
    "Du verkar vara utanför Föli-området, så ingen hållplats valdes. Sök med namn i stället.",
  "The nearest stop is {distance} away, so it was not filled in. Search by name instead.":
    "Närmaste hållplats ligger {distance} bort, så den valdes inte. Sök med namn i stället.",
  "Two stops are almost equally close. Search for the one that serves your direction.":
    "Två hållplatser ligger nästan lika nära. Sök efter den som passar din färdriktning.",
  "No nearby Föli stop could be resolved from your location. Search manually instead.":
    "Ingen närliggande Föli-hållplats kunde avgöras från din position. Sök manuellt i stället.",
  "More than one stop has this name. Choose the correct stop number from the suggestions.":
    "Flera hållplatser har det här namnet. Välj rätt hållplatsnummer bland förslagen.",
  "Choose a stop from the suggestions or enter its stop number.":
    "Välj en hållplats bland förslagen eller ange dess hållplatsnummer.",
  "Stop locations are still loading. Try again in a moment.":
    "Hållplatsernas positioner laddas fortfarande. Försök igen om en stund.",
  "Stop locations are temporarily unavailable. Search manually instead.":
    "Hållplatsernas positioner är tillfälligt otillgängliga. Sök manuellt i stället.",
  "Find your stop": "Hitta din hållplats",
  "e.g. Kauppatori": "t.ex. Kauppatori",
  "Use my location": "Använd min position",
  "Find nearest stop": "Hitta närmaste hållplats",
  "Show departures": "Visa avgångar",
  Show: "Visa",
  "Matching bus stops": "Matchande busshållplatser",
  "Search by stop name or number.": "Sök med hållplatsens namn eller nummer.",

  "Open {name}, stop {id}": "Öppna {name}, hållplats {id}",
  "Saved and recent stops": "Sparade och senaste hållplatser",
  Favourites: "Favoriter",
  Recent: "Senaste",

  "{name}, stop {id}, {distance} away": "{name}, hållplats {id}, {distance} bort",
  Nearest: "Närmaste",
  "Walk there: {name}, stop {id}, in Google Maps":
    "Gå dit: {name}, hållplats {id}, i Google Maps",
  "Walk there": "Gå dit",
  "Nearby-stop data is still loading. Try again in a moment.":
    "Data för närliggande hållplatser laddas fortfarande. Försök igen om en stund.",
  "Stop locations are temporarily unavailable. Search for your stop by name, and try again later.":
    "Hållplatsernas positioner är tillfälligt otillgängliga. Sök efter hållplatsen med namn och försök igen senare.",
  "Your location is approximate, so compare the nearby options before choosing.":
    "Din position är ungefärlig, så jämför alternativen i närheten innan du väljer.",
  "Your location appears outside Föli’s published service area. Nearby stops are shown for reference, but none was selected automatically.":
    "Din position verkar ligga utanför Fölis publicerade trafikområde. Närliggande hållplatser visas som referens, men ingen valdes automatiskt.",
  "The nearest Föli stop is {distance} away. You may be outside the Föli service area.":
    "Närmaste Föli-hållplats ligger {distance} bort. Du kan vara utanför Fölis trafikområde.",
  "The nearest Föli stop is {distance} away, so it was not selected automatically. Choose the stop that fits your journey.":
    "Närmaste Föli-hållplats ligger {distance} bort och valdes därför inte automatiskt. Välj den hållplats som passar din resa.",
  "Two stops are almost equally close. Choose the stop that serves your travel direction.":
    "Två hållplatser ligger nästan lika nära. Välj den hållplats som passar din färdriktning.",
  "Near you": "Nära dig",
  "Uses your location once. It isn’t saved.":
    "Använder din position en gång. Den sparas inte.",
  "The radar shows the way to a stop as you walk.":
    "Radarn visar vägen till en hållplats medan du går.",
  "Locating…": "Hämtar position…",
  "Update location": "Uppdatera position",
  "Getting stop locations…": "Hämtar hållplatsernas positioner…",
  "Location search is temporarily unavailable; stop search still works normally.":
    "Positionssökning är tillfälligt otillgänglig; hållplatssökning fungerar fortfarande normalt.",
  "Location found": "Position hittad",
  "Location found · ±{accuracy}": "Position hittad · ±{accuracy}",
  "{stop} is {distance} away": "{stop} ligger {distance} bort",
  "Nearest Föli stops": "Närmaste Föli-hållplatser",
  "Distances are approximate straight-line distances. “Walk there” opens an external walking route in Google Maps.":
    "Avstånden är ungefärliga fågelvägsavstånd. ”Gå dit” öppnar en extern gångrutt i Google Maps.",
  "Distances are approximate straight-line distances. Walking route links return when you’re online.":
    "Avstånden är ungefärliga fågelvägsavstånd. Länkar till gångrutter återkommer när du är online.",

  Journey: "Resa",
  "Where do you want to go?": "Vart vill du åka?",
  "Clear destination": "Rensa destination",
  "Going to": "På väg till",
  "Journey destination": "Resans destination",
  Change: "Ändra",
  Clear: "Rensa",
  "Saved destinations": "Sparade destinationer",
  "Choose a starting stop": "Välj starthållplats",
  "Nearby stops for {destination}": "Hållplatser nära {destination}",
  "Tap a stop to see when its buses leave.":
    "Tryck på en hållplats för att se dess avgångar.",
  "Nearby stop sorting": "Sortering av närliggande hållplatser",
  "Best for {destination}": "Bäst för {destination}",
  "Checking routes…": "Kontrollerar rutter…",
  "Checking which buses go to {destination}…":
    "Kontrollerar vilka bussar som går till {destination}…",
  "Goes to {destination}": "Går till {destination}",
  "Timing may be tight": "Tiden kan vara knapp",
  "Probably too late to catch": "Troligen för sent för att hinna",
  "Current buses go the other direction": "Nuvarande bussar går åt andra hållet",
  "No direct option to {destination} is shown soon":
    "Inget direktalternativ till {destination} visas inom kort",
  "Departure check unavailable": "Avgångskontroll är inte tillgänglig",
  "Can’t tell if you’ll make it in time": "Oklart om du hinner i tid",
  "Couldn’t check where these buses go":
    "Kunde inte kontrollera vart bussarna går",
  "Line {line}": "Linje {line}",
  "arrive about {time}": "fram cirka {time}",
  Best: "Bäst",
  "Nearby Föli stops for {destination}":
    "Föli-hållplatser nära {destination}",
  "Compare nearby stops": "Jämför hållplatser i närheten",

  "Direct options": "Direktalternativ",
  "Trip details": "Resedetaljer",
  "Best ways to {destination}": "Bästa sätten till {destination}",
  "1 option": "1 alternativ",
  "{count} options": options,
  Fastest: "Snabbast",
  "High confidence": "Hög säkerhet",
  "Medium confidence": "Medelhög säkerhet",
  "Low confidence": "Låg säkerhet",
  "Line {line} · you’re at its stop": "Linje {line} · du är vid dess hållplats",
  "Line {line} · you should make it": "Linje {line} · du bör hinna",
  "Line {line} · likely catchable": "Linje {line} · du hinner troligen",
  "Line {line} · tight — move now": "Linje {line} · ont om tid — gå nu",
  "Line {line} · boarding confidence unavailable": "Linje {line} · säkerheten för påstigning kan inte bedömas",
  "Less walking": "Mindre gång",
  "Easier to catch": "Lättare att hinna",
  "Arrive about {time}": "Framme cirka {time}",
  "from {stop}": "från {stop}",
  "to stop": "till hållplatsen",
  "{distance} less walking · about {minutes} min later":
    "{distance} mindre gång · cirka {minutes} min senare",
  "{distance} less walking": "{distance} mindre gång",
  "More time to catch · about {minutes} min later":
    "Mer tid att hinna · cirka {minutes} min senare",
  "More time to catch": "Mer tid att hinna",
  "Next bus": "Nästa buss",
  "Earlier bus": "Tidigare buss",
  "If you miss the first one · about {minutes} min later":
    "Om du missar den första · cirka {minutes} min senare",
  "If you miss the first one": "Om du missar den första",
  "More margin · arrives about {minutes} min earlier":
    "Mer marginal · framme cirka {minutes} min tidigare",
  "More margin": "Mer marginal",
  "The only bus there we found": "Den enda bussen dit som vi hittade",
  "about {minutes} min on the bus": "cirka {minutes} min på bussen",
  "Live estimate": "Realtidsprognos",
  "Timetable estimate": "Tidtabellsprognos",
  "Realtime uncertain": "Realtidsdata osäkra",
  Estimate: "Prognos",
  "Checking a little farther…": "Kontrollerar lite längre bort…",
  "Checked {count} nearby stops": "Kontrollerade {count} närliggande hållplatser",

  "Active journey": "Aktiv resa",
  "Choose another route": "Välj en annan rutt",
  "Wait for line {line}": "Vänta på linje {line}",
  "Walk to {stop}": "Gå till {stop}",
  "You’re near {stop}": "Du är nära {stop}",
  "Stay at {stop}": "Stanna vid {stop}",
  "Stay here for line {line}.": "Stanna här och vänta på linje {line}.",
  "Walk about {distance} to {stop} for line {line}.":
    "Gå cirka {distance} till {stop} för linje {line}.",
  "You are at the transfer stop. Confirm it below before waiting for the next bus.":
    "Du är vid byteshållplatsen. Bekräfta den nedan innan du väntar på nästa buss.",
  "When you get to the transfer stop, tap “I'm at the stop”.":
    "När du är vid byteshållplatsen, tryck på ”Jag är vid hållplatsen”.",
  "Wait here for line {line}.": "Vänta här på linje {line}.",
  "When line {line} arrives, open the selected departure and start the Get-off alert.":
    "När linje {line} kommer, öppna den valda avgången och starta avstigningslarmet.",
  "Show line {line} departure": "Visa avgång för linje {line}",
  "To {destination}": "Till {destination}",
  "Leaves {due}": "Avgår {due}",
  "Leaves now": "Avgår nu",
  "Leaves in {minutes} min": "Avgår om {minutes} min",
  "About {distance} to the boarding stop.":
    "Cirka {distance} till påstigningshållplatsen.",
  "When you get to the stop, tap “I'm at the stop”.":
    "När du är vid hållplatsen, tryck på ”Jag är vid hållplatsen”.",
  "Your selected bus is pinned first in the departure board.":
    "Din valda buss är fäst först på avgångstavlan.",
  "When you board, use Get-off alert on that departure. Ride Mode remains in control after that.":
    "När du stiger på, använd Avstigningslarm för den avgången. Reseläget förblir styrande därefter.",
  "Your selected bus was cancelled.": "Din valda buss ställdes in.",
  "Your selected bus is no longer a reliable option.":
    "Din valda buss är inte längre ett tillförlitligt alternativ.",
  "Offline: this selected plan may be out of date.":
    "Offline: den valda planen kan vara inaktuell.",
  "Your bus isn’t updated while another stop is open.":
    "Din buss uppdateras inte medan en annan hållplats är öppen.",
  "Can’t update your bus right now. Its time may be out of date.":
    "Det går inte att uppdatera din buss just nu. Tiden kan vara inaktuell.",
  "Back to {stop}": "Tillbaka till {stop}",
  "I'm at the stop": "Jag är vid hållplatsen",
  "Show selected departure": "Visa vald avgång",
  "Find another option": "Hitta ett annat alternativ",
  "View selected stop": "Visa vald hållplats",

  "Stop, address or place": "Hållplats, adress eller plats",
  "e.g. Prisma Itäharju or Kauppatori": "t.ex. Prisma Itäharju eller Kauppatori",
  "Searching…": "Söker…",
  "Search destination": "Sök destination",
  "Choose Home, Work, School, a Föli stop, address or place.":
    "Välj Hem, Arbete, Skola, en Föli-hållplats, adress eller plats.",
  "Destination suggestions":
    "Förslag på destinationer",
  "Nearest to me first":
    "Närmast mig först",
  "Stop suggestions stay on this device. Place/address text is sent to OpenStreetMap only after you press Search; repeated searches are cached only for this browser session.":
    "Hållplatsförslag stannar på den här enheten. Plats-/adresstext skickas till OpenStreetMap först när du trycker på Sök; upprepade sökningar cachelagras bara under den här webbläsarsessionen.",
  "Places & addresses": "Platser och adresser",
  "Choose one": "Välj ett",
  "Place search data": "Data för platssökning",
  "© OpenStreetMap contributors": "© OpenStreetMap-bidragsgivare",
  "Place search is temporarily unavailable. Föli stop search still works.":
    "Platssökning är tillfälligt otillgänglig. Sökning efter Föli-hållplatser fungerar fortfarande.",
  "Open Turku journey planner": "Öppna Åbos reseplanerare",
  "Journey timing and preference": "Restid och ruttpreferens",
  When: "När",
  "Leave now": "Åk nu",
  "Leave at": "Åk kl.",
  "Arrive by": "Framme senast",
  "Turku local time": "Lokal tid i Åbo",
  "Route preference": "Ruttpreferens",
  Balanced: "Balanserad",
  "Fewer transfers": "Färre byten",
  "More transfer time": "Mer bytestid",
  "Future-time searches use published Föli timetables. Live estimates are used for leave-now journeys when fresh.":
    "Sökningar för framtida tider använder Fölis publicerade tidtabeller. Realtidsprognoser används för resor som startar nu när data är färska.",
  "Choose a valid future Turku time. Times skipped by the daylight-saving clock change are not available.":
    "Välj en giltig framtida tid i Åbo. Tider som hoppas över vid övergången till sommartid är inte tillgängliga.",
  "Latest departure": "Senaste avgång",
  "Latest departure we found that meets your arrival time":
    "Senaste avgång vi hittade som klarar din ankomsttid",

  "Fresh transfer options": "Nya bytesalternativ",
  "Continue to {destination}": "Fortsätt till {destination}",
  "Checking fresh buses from this transfer area…":
    "Kontrollerar nya bussar från det här bytesområdet…",
  "Recovery search will resume when you’re online.":
    "Sökningen efter en ersättningsrutt fortsätter när du är online.",
  "Recovery search is temporarily unavailable. Your destination is kept.":
    "Sökningen efter en ersättningsrutt är tillfälligt otillgänglig. Din destination behålls.",
  "No reliable replacement with at most one new transfer is available from this transfer area right now.":
    "Det finns just nu ingen tillförlitlig ersättningsrutt med högst ett nytt byte från det här bytesområdet.",
  "These options start from the transfer area. Your journey changes only after you choose one.":
    "Dessa alternativ startar från bytesområdet. Din resa ändras först när du väljer ett.",
  "The failed bus is excluded. Nothing changes until you choose a new option.":
    "Den misslyckade bussen är utesluten. Ingenting ändras förrän du väljer ett nytt alternativ.",
  "Also checking options with a change of bus…":
    "Kontrollerar också alternativ med byte…",
  "No direct trip found nearby. Checking options with up to two transfers…":
    "Ingen direktresa hittades i närheten. Kontrollerar alternativ med upp till två byten…",
  "No reliable option with up to two transfers was found from the nearby stops.":
    "Inget tillförlitligt alternativ med upp till två byten hittades från de närliggande hållplatserna.",
  "Transfer search is temporarily unavailable. Nearby stops remain available.":
    "Sökning efter bytesresor är tillfälligt otillgänglig. Närliggande hållplatser är fortfarande tillgängliga.",
  "Transfer options": "Bytesalternativ",
  "Ways to {destination} with one change": "Resor till {destination} med ett byte",
  "Continue to {destination} with a new connection":
    "Fortsätt till {destination} med en ny anslutning",
  "Ways to {destination} with up to two changes":
    "Resor till {destination} med upp till två byten",
  "1 transfer": "1 byte",
  "{count} transfers": transfers,
  "Change {number}: {stop} · same stop":
    "Byte {number}: {stop} · samma hållplats",
  "Change {number}: {stop} · walk ≈ {distance}":
    "Byte {number}: {stop} · gång ≈ {distance}",
  "total walking ≈ {distance}": "total gång ≈ {distance}",
  "to first stop": "till första hållplatsen",
  "Comfortable transfer": "Gott om tid för byte",
  "Reasonable transfer": "Rimlig tid för byte",
  "Tight transfer": "Tight byte",
  "about {minutes} min transfer margin": "cirka {minutes} min bytesmarginal",
  "Future buses are rechecked against fresh live data. The app keeps each committed leg explicit and never silently switches you to another journey.":
    "Kommande bussar kontrolleras på nytt mot färska realtidsdata. Appen håller varje vald reseetapp uttrycklig och byter aldrig tyst till en annan resa.",
  "This replacement starts from the transfer area. Nothing changes until you choose it.":
    "Ersättningsrutten startar från bytesområdet. Ingenting ändras förrän du väljer den.",
  "Leg {current} of {total} · change at {stop} to line {line}":
    "Etapp {current} av {total} · byt vid {stop} till linje {line}",
  "Leg {current} of {total} · continue on line {line}":
    "Etapp {current} av {total} · fortsätt på linje {line}",
  "A committed future bus was cancelled. Choose a fresh option.":
    "En vald framtida buss ställdes in. Välj ett nytt alternativ.",
  "A committed future bus has probably been missed. Choose a fresh option.":
    "En vald framtida buss har troligen missats. Välj ett nytt alternativ.",
  "When you board, start the Get-off alert for this leg. Ride Mode stays in control until you get off, then Journey Assistant resumes with the next leg.":
    "När du stiger på, starta avstigningslarmet för den här etappen. Reseläget förblir styrande tills du stiger av, därefter fortsätter reseassistenten med nästa etapp.",
  "Your second bus was cancelled. Choose a fresh option.":
    "Din andra buss ställdes in. Välj ett nytt alternativ.",
  "Live check: line {line} still looks catchable.":
    "Realtidskontroll: linje {line} verkar fortfarande möjlig att hinna med.",
  "Live check: line {line} still looks catchable · about {minutes} min transfer margin.":
    "Realtidskontroll: linje {line} verkar fortfarande möjlig att hinna med · cirka {minutes} min bytesmarginal.",
  "Live check: the transfer to line {line} is tight.":
    "Realtidskontroll: bytet till linje {line} är tight.",
  "Live check: the transfer to line {line} is tight · about {minutes} min margin.":
    "Realtidskontroll: bytet till linje {line} är tight · cirka {minutes} min marginal.",
  "Live check: the transfer to line {line} is tight · less than 1 min margin.":
    "Realtidskontroll: bytet till linje {line} är tight · mindre än 1 min marginal.",
  "Live check for line {line} is uncertain. Keeping the selected connection until stronger evidence.":
    "Realtidskontrollen för linje {line} är osäker. Den valda anslutningen behålls tills starkare underlag finns.",
  "The second bus has probably been missed. Choose a fresh option.":
    "Den andra bussen har troligen missats. Välj ett nytt alternativ.",
  "The selected transfer can no longer be continued safely. Choose a fresh option.":
    "Det valda bytet kan inte längre fortsättas på ett tillförlitligt sätt. Välj ett nytt alternativ.",
  "When you board, start the Get-off alert for the selected transfer stop. Ride Mode stays in control until you get off, then Journey Assistant resumes with leg 2.":
    "När du stiger på, starta avstigningslarmet för den valda byteshållplatsen. Reseläget förblir styrande tills du stiger av, därefter fortsätter reseassistenten med etapp 2.",

  "Enter a stop, address or place.": "Ange en hållplats, adress eller plats.",
  "Place search needs a connection. You can still choose a Föli stop from the suggestions.":
    "Platssökning kräver internetanslutning. Du kan fortfarande välja en Föli-hållplats bland förslagen.",
  "Place search needs a connection. Search by Föli stop name or number while offline.":
    "Platssökning kräver internetanslutning. Sök med Föli-hållplatsens namn eller nummer när du är offline.",
  "Enter at least 3 characters to search places and addresses.":
    "Ange minst 3 tecken för att söka efter platser och adresser.",
  "No matching place or address was found. You can still choose a Föli stop from the suggestions.":
    "Ingen matchande plats eller adress hittades. Du kan fortfarande välja en Föli-hållplats bland förslagen.",
  "No matching stop, place or address was found. Try a more specific destination.":
    "Ingen matchande hållplats, plats eller adress hittades. Prova en mer specifik destination.",
  "No Föli stop close enough to this place could be resolved. Try another destination.":
    "Ingen Föli-hållplats tillräckligt nära den här platsen kunde identifieras. Prova en annan destination.",
  "Reach destination about {time}": "Nå destinationen cirka {time}",
  "final walk ≈ {distance}": "sista gångsträckan ≈ {distance}",
  "Arrival includes an approximate final walk based on straight-line distance; the real walking route can be longer.":
    "Ankomsten inkluderar en ungefärlig sista gångsträcka baserad på fågelvägsavstånd; den verkliga gångrutten kan vara längre.",
  "Final walk is approximate straight-line based guidance. The real walking route can be longer.":
    "Den sista gångsträckan är ungefärlig vägledning baserad på fågelvägsavstånd. Den verkliga gångrutten kan vara längre.",
  "This place appears outside Föli’s service area. Choose a destination inside the Föli area.":
    "Platsen verkar ligga utanför Fölis trafikområde. Välj en destination inom Föli-området.",
  "Place search is temporarily rate-limited. Wait a moment and try again; Föli stop search still works.":
    "Platssökningen är tillfälligt hastighetsbegränsad. Vänta en stund och försök igen; Föli-hållplatssökningen fungerar fortfarande.",
  "Final walk": "Sista gångsträckan",
  "Destination is roughly {direction} from this stop.":
    "Destinationen ligger ungefär {direction} från den här hållplatsen.",
  north: "norrut",
  "north-east": "nordost",
  east: "österut",
  "south-east": "sydost",
  south: "söderut",
  "south-west": "sydväst",
  west: "västerut",
  "north-west": "nordväst",
  "Walk to {destination}": "Gå till {destination}",
  "Walking distance is approximate straight-line guidance. The real walking route can be longer.":
    "Gångavståndet är ungefärlig vägledning baserad på fågelvägsavstånd. Den verkliga gångrutten kan vara längre.",
  "Walking link unavailable offline.": "Länk till gångrutt är inte tillgänglig offline.",
  Done: "Klar",
  "e.g. Tampereentie 12 or Prisma": "t.ex. Tampereentie 12 eller Prisma",
  "Searched on this device: nothing you type here is sent anywhere.":
    "Sökningen görs på den här enheten: det du skriver skickas ingenstans.",
  "Offline OpenStreetMap data may not contain every address. For a wider search, use the official Turku journey planner.":
    "Offline-data från OpenStreetMap innehåller kanske inte alla adresser. Använd Åbos officiella reseplanerare för en bredare sökning.",
  "No local stop, address or place matches “{query}”. Try the official Turku journey planner for a wider search.":
    "Den lokala sökningen hittade ingen hållplats, adress eller plats för “{query}”. Prova Åbos officiella reseplanerare för en bredare sökning.",
  "Online place search is unavailable. Local stop, address and place search still works.":
    "Platssökning online är inte tillgänglig. Lokal sökning efter hållplatser, adresser och platser fungerar fortfarande.",
  "Street midpoint": "Ungefärlig mittpunkt på gatan",
};
