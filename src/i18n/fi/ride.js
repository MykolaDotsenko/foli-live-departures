// Ride Mode: the get-off alert, its setup, and what it says, shows and sends
// during the ride. Shared phrases ("Stop {id}", "{minutes} min", "Line",
// "around {time}", "Ride Mode active") are translated in board.js and app.js.
/** @import { Dictionary } from "../index" */

/** @type {Dictionary} */
export default {
  // The stage, from boarding to the stop
  "No need to watch for your stop": "Pysäkkiäsi ei tarvitse vahtia",
  "We will warn you as your stop gets closer.":
    "Varoitamme, kun pysäkkisi lähestyy.",
  "Get ready": "Valmistaudu",
  "Your stop is coming up": "Pysäkkisi lähestyy",
  "Get your things together. We will tell you when to press STOP.":
    "Kerää tavarasi. Kerromme, kun on aika painaa STOP-nappia.",
  "Get your things together. We will tell you when your stop is next.":
    "Kerää tavarasi. Kerromme, kun pysäkkisi on seuraavana.",
  "Next stop": "Seuraava pysäkki",
  "Your stop is next": "Pysäkkisi on seuraavana",
  "Press the STOP button now.": "Paina STOP-nappia nyt.",
  "This is your stop": "Tämä on pysäkkisi",
  "Get off now": "Jää pois nyt",
  "Move to the doors and step off here.": "Siirry ovelle ja jää pois.",
  "Missed your stop?": "Ohititko pysäkkisi?",
  "Your stop may be behind you": "Pysäkkisi saattoi jäädä taakse",
  "Get off at the next stop and open its departures below.":
    "Jää pois seuraavalla pysäkillä ja avaa sen lähdöt alta.",
  "Get ready to exit at the next stop.":
    "Valmistaudu jäämään pois seuraavalla pysäkillä.",
  // Before the bus has left the stop before the exit. The stop's name stays
  // as on its sign, so it follows "pysäkin" / "pysäkiltä" rather than being
  // inflected itself.
  "Almost there": "Kohta perillä",
  "Get ready to press STOP": "Valmistaudu painamaan STOP-nappia",
  "Press STOP when the bus leaves {name}.":
    "Paina STOP-nappia, kun bussi lähtee pysäkiltä {name}.",
  "Your stop comes after": "Pysäkkisi on tämän pysäkin jälkeen:",
  "Press the stop button when the bus leaves it.":
    "Paina STOP-nappia, kun bussi lähtee siltä.",
  "Press STOP once the bus has left the stop before yours.":
    "Paina STOP-nappia, kun bussi on lähtenyt pysäkkiäsi edeltävältä pysäkiltä.",

  // Estimate and stops left. "1 stop" and "{count} stops" (2 or more) take
  // the Finnish singular and partitive forms as they stand.
  now: "nyt",
  "running late": "myöhässä",
  "about now": "ihan kohta",
  // What a screen reader says for "~2 min": the tilde is only for the eye.
  "about {time}": "noin {time}",
  "you are here": "olet perillä",
  "behind you": "jäi taakse",
  "almost there": "melkein perillä",
  "1 stop": "1 pysäkki",
  "{count} stops": "{count} pysäkkiä",
  Remaining: "Jäljellä",
  Estimate: "Arvio",
  "By timetable": "Aikataulun mukaan",
  "Your bus is live, but Föli has no time for {name} yet, so this time is from the timetable.":
    "Bussisi näkyy reaaliaikatiedoissa, mutta pysäkille {name} ei ole vielä aikaa, joten aika on aikataulusta.",
  "Estimated from the timetable until Föli’s live data shows your bus.":
    "Arvio perustuu aikatauluun, kunnes bussisi näkyy Fölin reaaliaikatiedoissa.",
  "Ride progress": "Matkan eteneminen",

  // What the live data shows
  "Following your bus": "Seurataan bussiasi",
  "Live tracking is catching up": "Reaaliaikatieto viivästyy",
  "Going by the timetable": "Aikataulun mukaan",
  "Your bus is confirmed": "Bussi löytyi",
  "seen in Föli’s live times": "näkyy Fölin reaaliaikatiedoissa",
  "in Föli’s live times": "Fölin reaaliaikatiedoista",
  "on its way to {name}": "matkalla pysäkille {name}",
  "Waiting for a live update": "Odotetaan reaaliaikapäivitystä",
  "last seen in Föli’s live data about a minute ago":
    "nähty viimeksi Fölin reaaliaikatiedoissa noin minuutti sitten",
  "Looking for your bus": "Etsitään bussiasi",

  // Where the phone is
  "last seen {minutes} min ago": "viimeisin sijainti {minutes} min sitten",
  "last seen over a minute ago": "viimeisin sijainti yli minuutti sitten",
  "going by bus times only": "vain bussin aikatietojen perusteella",
  "about {meters} m past your stop": "noin {meters} m pysäkkisi jälkeen",
  "about {meters} m to go": "noin {meters} m jäljellä",
  "≈{meters} m from your stop": "≈{meters} m pysäkiltäsi",
  "waiting for a location": "odotetaan sijaintia",
  "Not using your location": "Sijaintiasi ei käytetä",
  "Lost track of your location": "Sijaintisi seuranta katkesi",
  "You may not be on this route": "Et ehkä ole tällä reitillä",
  "Following you along the route": "Seurataan sinua reittiä pitkin",
  "Following you, roughly": "Seurataan sijaintiasi likimääräisesti",
  "Weak location signal": "Heikko sijaintisignaali",
  "Finding your location": "Haetaan sijaintiasi",
  "Cannot use your location": "Sijaintiasi ei voi käyttää",
  "This phone cannot share location": "Tämä puhelin ei voi jakaa sijaintia",
  "Waiting for your location": "Odotetaan sijaintiasi",
  "Location isn’t available on this device.":
    "Sijainnin seuranta ei ole käytettävissä tällä laitteella.",
  "Location wasn’t allowed.": "Sijainnin käyttöä ei sallittu.",
  "Location isn’t available right now.":
    "Sijainnin seuranta ei ole juuri nyt käytettävissä.",
  "The alert keeps going without your location.":
    "Hälytys toimii ilman sijaintiasi.",

  // The panel
  "Your stop": "Pysäkkisi",
  "after {name}": "pysäkin {name} jälkeen",
  "Alert sound check": "Hälytysäänen tarkistus",
  "Did you hear the test alert?": "Kuulitko testihälytyksen?",
  Yes: "Kyllä",
  No: "Ei",
  "Let's get the sound working": "Laitetaan ääni toimimaan",
  "Turn the media volume up.": "Nosta median äänenvoimakkuutta.",
  "Switch off silent or focus mode.":
    "Poista äänetön tila tai keskittymistila käytöstä.",
  "Check the sound isn’t going to a Bluetooth device.":
    "Tarkista, ettei ääni mene Bluetooth-laitteeseen.",
  "Play it again": "Toista uudelleen",
  "I can hear it now": "Nyt kuuluu",
  "Tracking is already running. Your phone will also vibrate and show a notification.":
    "Seuranta on jo käynnissä. Puhelimesi myös värisee ja näyttää ilmoituksen.",
  "Tracking is already running. Your phone will also vibrate.":
    "Seuranta on jo käynnissä. Puhelimesi myös värisee.",
  "Tracking is already running. You will also get a notification.":
    "Seuranta on jo käynnissä. Saat myös ilmoituksen.",
  "Tracking is already running. Keep the sound on: this phone will not vibrate for these alerts.":
    "Seuranta on jo käynnissä. Pidä ääni päällä: tämä puhelin ei värise näiden hälytysten aikana.",
  "Next planned stop: {name}": "Seuraava pysäkki reitillä: {name}",
  "Open next stop": "Avaa seuraava pysäkki",
  "I'm getting off": "Jään pois",
  "Test alert": "Testaa hälytys",
  "Turn off alert": "Lopeta hälytys",
  "Tap again to turn it off": "Lopeta napauttamalla uudelleen",
  "Keeping your screen on": "Näyttö pidetään päällä",
  "Cannot keep your screen on": "Näyttöä ei voi pitää päällä",
  "Your screen may switch off": "Näyttö voi sammua",
  "Keep this screen open": "Pidä tämä näkymä auki",
  "We cannot see your bus in the live data right now, so we are going by the timetable. You will still get the early warnings, but we will not say “get off now” on the timetable alone.":
    "Emme näe bussiasi reaaliaikatiedoissa juuri nyt, joten seuraamme aikataulua. Saat silti ennakkovaroitukset, mutta pelkän aikataulun perusteella emme sano ”jää pois nyt”.",
  "Check your bus": "Tarkista bussisi",
  "For two minutes you have not been moving along line {line} to {destination}. Are you still on this bus?":
    "Et ole kahteen minuuttiin liikkunut linjan {line} reittiä suuntaan {destination}. Oletko yhä tässä bussissa?",
  "For two minutes you have not been moving along line {line}. Are you still on this bus?":
    "Et ole kahteen minuuttiin liikkunut linjan {line} reittiä pitkin. Oletko yhä tässä bussissa?",
  "For two minutes you have not been moving along this route to {destination}. Are you still on this bus?":
    "Et ole kahteen minuuttiin liikkunut tätä reittiä suuntaan {destination}. Oletko yhä tässä bussissa?",
  "For two minutes you have not been moving along this route. Are you still on this bus?":
    "Et ole kahteen minuuttiin liikkunut tätä reittiä pitkin. Oletko yhä tässä bussissa?",
  "Yes, keep tracking": "Kyllä, jatka seurantaa",
  "The route map didn’t load, so we use straight-line distance to your stop. Live bus times still work.":
    "Reitin kulkua ei saatu ladattua, joten käytämme linnuntie-etäisyyttä pysäkillesi. Bussin reaaliaikatiedot toimivat yhä.",
  "The get-off alert is travel help, not a guaranteed alarm. A browser can pause a page it thinks you have left, so keep this screen open with the sound on.":
    "Pysäkkihälytys on matka-apu, eikä sen toimintaa voida taata. Selain voi keskeyttää sivun, jolta se luulee sinun poistuneen, joten pidä tämä sivu auki ja ääni päällä.",

  // Setup
  "Set up get-off alerts": "Aseta pysäkkihälytys",
  "Where do you want to get off?": "Millä pysäkillä jäät pois?",
  "Pick your stop and keep this page open with the sound on. You do not have to watch it: we tell you when to press STOP.":
    "Valitse pysäkkisi ja pidä tämä sivu auki ääni päällä. Sitä ei tarvitse katsoa: kerromme, kun on aika painaa STOP-nappia.",
  Cancel: "Peruuta",
  "Loading this trip's planned stops…": "Ladataan tämän vuoron pysäkkejä…",
  "The get-off alert needs a connection to load this bus's stops.":
    "Pysäkkihälytys tarvitsee verkkoyhteyden, jotta bussin pysäkit voidaan ladata.",
  "We cannot load this bus's stops right now. Close this and try again in a moment.":
    "Bussin pysäkkejä ei saada juuri nyt ladattua. Sulje tämä ja yritä hetken päästä uudelleen.",
  "This bus comes back to this stop later on its route, and we cannot tell which pass you are boarding. We will not guess about your stop.":
    "Tämä bussi palaa tälle pysäkille myöhemmin reitillään, emmekä voi tietää, millä kerralla nouset kyytiin. Emme arvaile pysäkkiäsi.",
  "No later drop-off stops are available for this trip.":
    "Tällä vuorolla ei ole myöhempiä pysäkkejä, joilla voi jäädä pois.",
  "Choose your exit stop": "Valitse pysäkki, jolla jäät pois",
  "{count} stops away": "{count} pysäkin päässä",
  "Follow my location (recommended)": "Seuraa sijaintiani (suositeltu)",
  "Times the alerts to where you really are, not only to the timetable. Your location stays on this phone and is forgotten when the ride ends.":
    "Hälytys perustuu sijaintiisi eikä pelkkään aikatauluun. Sijainti pysyy puhelimessa ja unohtuu, kun matka päättyy.",
  "Also show notifications": "Näytä myös ilmoitukset",
  "Only while this page is open. A locked phone often pauses it.":
    "Toimii vain, kun tämä sivu on auki. Lukittu puhelin pysäyttää sivun usein.",
  "On iPhone, notifications need this app on your Home Screen (Share, then Add to Home Screen). Sound and vibration work here as long as this page stays open.":
    "iPhonessa ilmoitukset vaativat, että sovellus on lisätty Koti-valikkoon (Jaa ja sitten Lisää Koti-valikkoon). Ääni ja värinä toimivat täällä niin kauan kuin tämä sivu pysyy auki.",
  "On iPhone, notifications need this app on your Home Screen (Share, then Add to Home Screen). The alert sound works here as long as this page stays open, but this phone will not vibrate for it.":
    "iPhonessa ilmoitukset vaativat, että sovellus on lisätty Koti-valikkoon (Jaa ja sitten Lisää Koti-valikkoon). Hälytysääni toimii täällä niin kauan kuin tämä sivu pysyy auki, mutta puhelin ei värise.",
  "Check your sound": "Tarkista ääni ensin",
  "Starting plays a test alert, so you can check the sound and vibration now. We only say “get off now” when live bus data or your location confirms it.":
    "Kun käynnistät, kuulet testihälytyksen – tarkista samalla ääni ja värinä. Sanomme ”jää pois nyt” vain, kun bussin reaaliaikatieto tai sijaintisi vahvistaa sen.",
  "Starting plays a test alert, so you can check the sound now; this phone will not vibrate for these alerts. We only say “get off now” when live bus data or your location confirms it.":
    "Kun käynnistät, kuulet testihälytyksen – tarkista samalla ääni. Puhelin ei värise näistä hälytyksistä. Sanomme ”jää pois nyt” vain, kun bussin reaaliaikatieto tai sijaintisi vahvistaa sen.",
  "Choose the stop you want to get off at first.":
    "Valitse ensin pysäkki, jolla jäät pois.",
  "We do not have a departure time for this bus yet. Wait for the board to refresh and try again.":
    "Tälle bussille ei ole vielä lähtöaikaa. Odota, että lähtötaulu päivittyy, ja yritä uudelleen.",
  "We cannot work out a reliable plan for that stop on this trip. Try another stop, or start the ride from a different departure.":
    "Emme pysty laatimaan luotettavaa suunnitelmaa tälle pysäkille tällä vuorolla. Kokeile toista pysäkkiä tai aloita matka toisesta lähdöstä.",
  "Start get-off alert": "Käynnistä pysäkkihälytys",
  "Switch get-off alert to line {line}? Your current alert will end.":
    "Vaihdetaanko pysäkkihälytys linjalle {line}? Nykyinen hälytys päättyy.",
  "Switch get-off alert to this trip? Your current alert will end.":
    "Vaihdetaanko pysäkkihälytys tähän vuoroon? Nykyinen hälytys päättyy.",
  "Get off at {name}": "Jäät pois: {name}",
  "Line {line} leaves {time}": "Linja {line} lähtee klo {time}",
  "Line {line}": "Linja {line}",
  "This trip leaves {time}": "Tämä vuoro lähtee klo {time}",
  "This trip": "Tämä vuoro",
  // Spoken. The stop name is read on its own, by the Finnish voice. The
  // spoken instruction keeps the stop button in lower case, as the English
  // one does.
  "your stop": "pysäkkisi",
  "Your get-off alert is working.": "Pysäkkihälytys toimii.",
  "Get ready. Your stop is coming up.": "Valmistaudu. Pysäkkisi lähestyy.",
  "The next stop is yours.": "Pysäkkisi on seuraavana.",
  "Press the stop button now.": "Paina stop-nappia nyt.",
  "This is your stop.": "Tämä on pysäkkisi.",
  "Get off now.": "Jää pois nyt.",
  "It looks like your stop is behind you. Get off at the next stop.":
    "Näyttää siltä, että pysäkkisi jäi taakse. Jää pois seuraavalla pysäkillä.",

  // Notifications
  "{name} is coming up soon.": "{name} lähestyy pian.",
  "Next stop: {name}": "Seuraava pysäkki: {name}",
  "This is your stop: {name}": "Tämä on pysäkkisi: {name}",
  "Get off at the next stop and open its departures in the app.":
    "Jää pois seuraavalla pysäkillä ja avaa sen lähdöt sovelluksessa.",
  "Your get-off alert is working": "Pysäkkihälytys toimii",
};
