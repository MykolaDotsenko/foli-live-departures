import { liveCount, upcoming, scheduledCount } from "./runtime.js";

/** @import { Dictionary } from "../index" */

/** @type {Dictionary} */
export default {
  Due: "Nu",
  "column|Due": "Avgår",
  "{minutes} min": "{minutes} min",
  Today: "I dag",
  Tomorrow: "I morgon",
  "on time": "i tid",
  "{minutes} min late": "{minutes} min sen",
  "{minutes} min early": "{minutes} min tidig",
  Scheduled: "Tidtabell",
  Live: "Realtid",
  "Live data · {minutes} min old": "Realtidsdata · {minutes} min gamla",
  "Live data · 1 min old": "Realtidsdata · 1 min gamla",
  "just now": "nyss",
  "1 min ago": "för 1 min sedan",
  "{minutes} min ago": "för {minutes} min sedan",

  "Bus is at the stop": "Bussen är vid hållplatsen",
  "Last bus position ≈{distance} from stop · {minutes} min old":
    "Bussens senaste position ≈{distance} från hållplatsen · {minutes} min gammal",
  "Bus at or near stop": "Bussen är vid eller nära hållplatsen",
  "Bus nearby · ≈{distance} from stop":
    "Bussen är nära · ≈{distance} från hållplatsen",
  "Bus ≈{distance} from stop": "Bussen är ≈{distance} från hållplatsen",
  "Waterbus is at the stop": "Vattenbussen är vid hållplatsen",
  "Last waterbus position ≈{distance} from stop · {minutes} min old":
    "Vattenbussens senaste position ≈{distance} från hållplatsen · {minutes} min gammal",
  "Waterbus at or near stop": "Vattenbussen är vid eller nära hållplatsen",
  "Waterbus nearby · ≈{distance} from stop":
    "Vattenbussen är nära · ≈{distance} från hållplatsen",
  "Waterbus ≈{distance} from stop":
    "Vattenbussen är ≈{distance} från hållplatsen",
  "Wheelchair accessible": "Tillgänglig med rullstol",
  "Not wheelchair accessible": "Inte tillgänglig med rullstol",
  "Not accessible": "Inte tillgänglig",

  "Loading…": "Laddar…",
  "Save {name} to favourites": "Spara {name} som favorit",
  "Remove favourite": "Ta bort favorit",
  "Save favourite": "Spara som favorit",
  "Saved. You’ll find it under the stop search.":
    "Sparad. Du hittar den under hållplatssökningen.",
  "Removed from favourites.": "Borttagen från favoriter.",
  "Updated {time}": "Uppdaterad {time}",
  "Refreshing…": "Uppdaterar…",
  Refresh: "Uppdatera",
  "Departure data summary": "Sammanfattning av avgångsdata",
  "{count} upcoming": upcoming,
  "Filter lines": "Filtrera linjer",
  "Only line {line}": "Endast linje {line}",
  "Only lines {lines}": "Endast linjerna {lines}",
  "Show only these lines": "Visa endast dessa linjer",
  "All lines": "Alla linjer",
  "Föli has no stop {id}.": "Föli har ingen hållplats {id}.",
  "Check the number, or search by the stop’s name.":
    "Kontrollera numret eller sök med hållplatsens namn.",
  "Checking the timetable for line {line}…":
    "Kontrollerar tidtabellen för linje {line}…",
  "Checking the timetable for lines {lines}…":
    "Kontrollerar tidtabellerna för linjerna {lines}…",
  "Line {line} is not in Föli’s live times right now.":
    "Linje {line} visas inte i Fölis realtidsdata just nu.",
  "Lines {lines} are not in Föli’s live times right now.":
    "Linjerna {lines} visas inte i Fölis realtidsdata just nu.",
  "Its timetable could not be checked either, so buses may still run.":
    "Tidtabellen kunde inte heller kontrolleras, så bussar kan fortfarande gå.",
  "No departures on line {line} from this stop in the next 36 hours.":
    "Inga avgångar på linje {line} från den här hållplatsen under de närmaste 36 timmarna.",
  "No departures on lines {lines} from this stop in the next 36 hours.":
    "Inga avgångar på linjerna {lines} från den här hållplatsen under de närmaste 36 timmarna.",
  "Other lines are leaving from this stop.":
    "Andra linjer avgår från den här hållplatsen.",
  "Show all lines": "Visa alla linjer",
  live: liveCount,
  "{count} scheduled": scheduledCount,
  "Live update failed": "Realtidsuppdateringen misslyckades",
  "Offline · last updated {time}": "Offline · senast uppdaterad {time}",
  "Last live estimate": "Senaste realtidsprognosen",
  "Live times may be out of date": "Realtidstiderna kan vara inaktuella",
  "last successful update {age}": "senaste lyckade uppdatering {age}",
  "Live times aren’t available · showing the timetable.":
    "Realtidstider är inte tillgängliga · visar tidtabellen.",
  "No live times right now · showing the timetable.":
    "Inga realtidstider just nu · visar tidtabellen.",
  "Later departures could not be checked, so more buses may run after these.":
    "Senare avgångar kunde inte kontrolleras, så fler bussar kan gå efter dessa.",
  "Connecting to Föli": "Ansluter till Föli",
  "Loading departures…": "Laddar avgångar…",
  "Couldn’t load departures.": "Kunde inte ladda avgångar.",
  "Föli’s live times aren’t loading right now. Try again in a moment.":
    "Fölis realtidstider laddas inte just nu. Försök igen om en stund.",
  "Try again": "Försök igen",
  "No live departures right now.": "Inga realtidsavgångar just nu.",
  "The timetable could not be checked just now, so later buses may still run.":
    "Tidtabellen kunde inte kontrolleras just nu, så senare bussar kan fortfarande gå.",
  Updating: "Uppdaterar",
  "Checking for the next departures…": "Kontrollerar nästa avgångar…",
  "No upcoming departures.": "Inga kommande avgångar.",
  "Try refreshing or choosing another nearby stop.":
    "Försök uppdatera eller välj en annan hållplats i närheten.",
  Line: "Linje",
  Destination: "Destination",
  "Unknown destination": "Okänd destination",
  "Cancelled at this stop · was due {time}":
    "Inställd vid den här hållplatsen · skulle avgå {time}",
  "Alert on": "Larm aktivt",
  "Get-off alert": "Avstigningslarm",
  Cancelled: "Inställd",
  "About live estimates": "Om realtidsprognoser",
  "Live times are Föli’s estimates from the buses themselves. A bus’s distance is a straight line from its last reported position. Scheduled means Föli has no live data for that trip right now.":
    "Realtidstider är Fölis uppskattningar från bussarna. Bussens avstånd är fågelvägen från dess senast rapporterade position. Tidtabell betyder att Föli inte har realtidsdata för den turen just nu.",

  "Hide stops": "Dölj hållplatser",
  "Next stops": "Nästa hållplatser",
  "short|Next stops": "Hållplatser",
  "Next stops · timetable times": "Nästa hållplatser · tidtabellstider",
  "Exact times are from the timetable. “Around” means an estimate.":
    "Exakta tider kommer från tidtabellen. ”Cirka” betyder en uppskattning.",
  "Loading planned stops…": "Laddar planerade hållplatser…",
  "Next stops are temporarily unavailable.":
    "Nästa hållplatser är tillfälligt otillgängliga.",
  "No later stops are listed.": "Inga senare hållplatser är listade.",
  "around {time}": "cirka {time}",
  planned: "planerad",
  "no drop-off": "endast påstigning",
  "+{count} more · final stop": "+{count} till · ändhållplats",

  "Fastest to {destination}: line {line} at {time}":
    "Snabbast till {destination}: linje {line} kl. {time}",
  "To {destination}: line {line} at {time}":
    "Till {destination}: linje {line} kl. {time}",
  "None of the buses listed here go to {destination}.":
    "Ingen av bussarna här går till {destination}.",
  "Other direction for {destination}": "Annan riktning mot {destination}",
  "Your bus": "Din buss",
};
