import { liveCount, scheduledCount } from "./runtime.js";

// The departure board, its next stops, and the times and distances it shows.
/** @import { Dictionary } from "../index" */

/** @type {Dictionary} */
export default {
  // Times (utils/time.js)
  Due: "Nyt",
  "column|Due": "Lähtee",
  "{minutes} min": "{minutes} min",
  Today: "Tänään",
  Tomorrow: "Huomenna",
  "on time": "ajallaan",
  "{minutes} min late": "{minutes} min myöhässä",
  "{minutes} min early": "{minutes} min etuajassa",
  Scheduled: "Aikataulu",
  Live: "Reaaliaika",
  "Live data · {minutes} min old": "Reaaliaikatieto · {minutes} min vanha",
  "Live data · 1 min old": "Reaaliaikatieto · 1 min vanha",
  "just now": "juuri nyt",
  "1 min ago": "1 min sitten",
  "{minutes} min ago": "{minutes} min sitten",

  // Where the bus is
  "Bus is at the stop": "Bussi on pysäkillä",
  "Last bus position ≈{distance} from stop · {minutes} min old":
    "Bussin viimeisin sijainti ≈{distance} pysäkiltä · {minutes} min vanha",
  "Bus at or near stop": "Bussi pysäkillä tai sen lähellä",
  "Bus nearby · ≈{distance} from stop": "Bussi lähellä · ≈{distance} pysäkiltä",
  "Bus ≈{distance} from stop": "Bussi ≈{distance} pysäkiltä",
  "Waterbus is at the stop": "Vesibussi on laiturilla",
  "Last waterbus position ≈{distance} from stop · {minutes} min old":
    "Vesibussin viimeisin sijainti ≈{distance} laiturilta · {minutes} min vanha",
  "Waterbus at or near stop": "Vesibussi laiturilla tai sen lähellä",
  "Waterbus nearby · ≈{distance} from stop":
    "Vesibussi lähellä · ≈{distance} laiturilta",
  "Waterbus ≈{distance} from stop": "Vesibussi ≈{distance} laiturilta",
  "Wheelchair accessible": "Esteetön",
  "Not wheelchair accessible": "Ei esteetön",
  "Not accessible": "Ei esteetön",

  // Board
  "Loading…": "Ladataan…",
  "Save {name} to favourites": "Lisää suosikkeihin: {name}",
  "Remove favourite": "Poista suosikki",
  "Save favourite": "Lisää suosikiksi",
  "Saved. You’ll find it under the stop search.":
    "Tallennettu. Löydät sen pysäkkihaun alta.",
  "Removed from favourites.": "Poistettu suosikeista.",
  "Updated {time}": "Päivitetty klo {time}",
  "Refreshing…": "Päivitetään…",
  Refresh: "Päivitä",
  "Departure data summary": "Lähtötietojen yhteenveto",
  "{count} upcoming": "{count} tulossa",
  "Filter lines": "Suodata linjoja",
  "Only line {line}": "Vain linja {line}",
  "Only lines {lines}": "Vain linjat {lines}",
  "Show only these lines": "Näytä vain nämä linjat",
  "All lines": "Kaikki linjat",
  "Föli has no stop {id}.": "Fölillä ei ole pysäkkiä {id}.",
  "Check the number, or search by the stop’s name.":
    "Tarkista numero tai hae pysäkin nimellä.",
  "Checking the timetable for line {line}…": "Tarkistetaan linjan {line} aikataulua…",
  "Checking the timetable for lines {lines}…": "Tarkistetaan linjojen {lines} aikatauluja…",
  "Line {line} is not in Föli’s live times right now.":
    "Linjaa {line} ei juuri nyt näy Fölin reaaliaikatiedoissa.",
  "Lines {lines} are not in Föli’s live times right now.":
    "Linjoja {lines} ei juuri nyt näy Fölin reaaliaikatiedoissa.",
  "Its timetable could not be checked either, so buses may still run.":
    "Aikataulua ei myöskään saatu tarkistettua, joten busseja voi silti kulkea.",
  "No departures on line {line} from this stop in the next 36 hours.":
    "Linjalla {line} ei ole lähtöjä tältä pysäkiltä seuraavan 36 tunnin aikana.",
  "No departures on lines {lines} from this stop in the next 36 hours.":
    "Linjoilla {lines} ei ole lähtöjä tältä pysäkiltä seuraavan 36 tunnin aikana.",
  "Other lines are leaving from this stop.":
    "Tältä pysäkiltä lähtee muita linjoja.",
  "Show all lines": "Näytä kaikki linjat",
  live: liveCount,
  "{count} scheduled": scheduledCount,
  "Live update failed": "Reaaliaikapäivitys epäonnistui",
  "Offline · last updated {time}": "Ei yhteyttä · päivitetty viimeksi klo {time}",
  "Last live estimate": "Viimeisin reaaliaika-arvio",
  "Live times may be out of date": "Reaaliaikatiedot voivat olla vanhentuneita",
  "last successful update {age}": "viimeisin onnistunut päivitys {age}",
  "Live times aren’t available · showing the timetable.":
    "Reaaliaikatiedot eivät ole saatavilla · näytetään aikataulu.",
  "No live times right now · showing the timetable.":
    "Reaaliaikatietoja ei nyt ole · näytetään aikataulu.",
  "Later departures could not be checked, so more buses may run after these.":
    "Myöhempiä lähtöjä ei voitu tarkistaa, joten näiden jälkeen voi kulkea muitakin busseja.",
  "Connecting to Föli": "Yhdistetään Föliin",
  "Loading departures…": "Ladataan lähtöjä…",
  "Couldn’t load departures.": "Lähtöjä ei voitu ladata.",
  "Föli’s live times aren’t loading right now. Try again in a moment.":
    "Fölin reaaliaikatiedot eivät juuri nyt lataudu. Yritä hetken päästä uudelleen.",
  "Try again": "Yritä uudelleen",
  "No live departures right now.": "Reaaliaikaisia lähtöjä ei nyt näy.",
  "The timetable could not be checked just now, so later buses may still run.":
    "Aikataulua ei saatu tarkistettua, joten myöhemmin voi vielä kulkea busseja.",
  Updating: "Päivitetään",
  "Checking for the next departures…": "Tarkistetaan seuraavia lähtöjä…",
  "No upcoming departures.": "Ei tulevia lähtöjä.",
  "Try refreshing or choosing another nearby stop.":
    "Päivitä tai valitse toinen lähellä oleva pysäkki.",
  Line: "Linja",
  Destination: "Määränpää",
  "Unknown destination": "Tuntematon määränpää",
  "Cancelled at this stop · was due {time}":
    "Peruttu tällä pysäkillä · aikataulun mukaan klo {time}",
  "Alert on": "Hälytys päällä",
  // U8: "Sulje asetukset" did not say which settings.
  // The ride setup is already "Aseta pysäkkihälytys": the button uses the
  // same word, at every width.
  "Get-off alert": "Pysäkki\u00ADhälytys",
  Cancelled: "Peruttu",
  "About live estimates": "Tietoa reaaliaika-arvioista",
  "Live times are Föli’s estimates from the buses themselves. A bus’s distance is a straight line from its last reported position. Scheduled means Föli has no live data for that trip right now.":
    "Reaaliaikaiset ajat ovat Fölin arvioita busseilta saaduista tiedoista. Bussin etäisyys on linnuntie-etäisyys sen viimeksi ilmoittamasta sijainnista. Aikataulu tarkoittaa, ettei Fölillä ole juuri nyt reaaliaikaista tietoa vuorosta.",

  // Next stops
  "Hide stops": "Piilota pysäkit",
  "Next stops": "Seuraavat pysäkit",
  // A narrow phone's labels, so a row's two actions share one line.
  "short|Next stops": "Pysäkit",
  "Next stops · timetable times": "Seuraavat pysäkit · aikataulun ajat",
  "Exact times are from the timetable. “Around” means an estimate.":
    "Tarkat ajat ovat aikataulusta. ”Noin” tarkoittaa arviota.",
  "Loading planned stops…": "Ladataan pysäkkejä…",
  "Next stops are temporarily unavailable.":
    "Seuraavat pysäkit eivät ole juuri nyt saatavilla.",
  "No later stops are listed.": "Myöhempiä pysäkkejä ei ole listattu.",
  "around {time}": "noin klo {time}",
  planned: "suunniteltu",
  // Finnish timetables' own term for a stop where no one may get off.
  "no drop-off": "vain nousu",
  "+{count} more · final stop": "+{count} lisää · päätepysäkki",

  // Destination-aware board
  "Trips to {destination} are shown first. Other departures stay below.":
    "Määränpäähän {destination} menevät lähdöt näytetään ensin. Muut lähdöt jäävät niiden alle.",
  "Other direction for {destination}":
    "Toinen suunta määränpäähän {destination}",

  "Your bus": "Sinun bussisi",

};
