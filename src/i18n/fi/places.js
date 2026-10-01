// My Places, Get me Home, the printed Home card and the driver card's
// buttons. What the driver reads is Finnish already and never goes through
// here.
/** @import { Dictionary } from "../index" */

/** @type {Dictionary} */
export default {
  // The places, named by id (hooks/useSavedPlaces.js)
  Home: "Koti",
  School: "Koulu",
  Work: "Työ",

  // My Places
  "My Places": "Omat paikat",
  "Save the stop nearest Home, School or Work. No address needed.":
    "Tallenna kodin, koulun tai työpaikan lähin pysäkki. Osoitetta ei tarvita.",
  "Finding the closest Föli stops…": "Etsitään lähimpiä Fölin pysäkkejä…",
  "Route links send Google Maps only the stop you’re going to. Google Maps may then use your location to plan the route.":
    "Reittilinkit kertovat Google Mapsille vain määränpääpysäkin. Google Maps voi sitten käyttää sijaintiasi reitin laskemiseen.",
  "Stop locations are temporarily unavailable.":
    "Pysäkkien sijainnit eivät ole juuri nyt saatavilla.",
  "This location appears outside Föli’s published service area. Choose a public stop manually instead.":
    "Sijainti näyttää olevan Fölin julkaiseman palvelualueen ulkopuolella. Valitse sen sijaan julkinen pysäkki itse.",
  "The nearest Föli stop is {distance} away. Move closer to the place before saving it.":
    "Lähin Fölin pysäkki on {distance} päässä. Mene lähemmäs paikkaa ennen kuin tallennat sen.",

  // A place not set up yet
  "Tick at least one stop to save.": "Valitse vähintään yksi pysäkki, niin voit tallentaa.",
  "Not set": "Ei vielä tallennettu",
  "Not at the stop? Search for it first, then choose it here.":
    "Et ole pysäkillä? Hae se ensin ja valitse se sitten tästä.",
  "Use my location": "Käytä sijaintiani",
  "Use {name}": "Käytä pysäkkiä {name}",

  // Choosing a place's stops
  "Choose stops for Home": "Valitse kodin pysäkit",
  "Choose stops for School": "Valitse koulun pysäkit",
  "Choose stops for Work": "Valitse työpaikan pysäkit",
  "Tick the stops you use to get Home, and mark one as the main stop.":
    "Valitse pysäkit, joita käytät kotimatkalla, ja merkitse yksi pääpysäkiksi.",
  "Tick the stops you use to get to School, and mark one as the main stop.":
    "Valitse pysäkit, joita käytät koulumatkalla, ja merkitse yksi pääpysäkiksi.",
  "Tick the stops you use to get to Work, and mark one as the main stop.":
    "Valitse pysäkit, joita käytät työmatkalla, ja merkitse yksi pääpysäkiksi.",
  "How this works": "Miten tämä toimii",
  Cancel: "Peruuta",
  "Review the public stop you selected and confirm that it is suitable for this destination.":
    "Tarkista valitsemasi julkinen pysäkki ja vahvista, että se sopii tähän määränpäähän.",
  "When location quality is good and a stop is reasonably close, the nearest stop is selected first. Otherwise you must choose manually.":
    "Kun sijainti on tarkka ja pysäkki riittävän lähellä, lähin pysäkki valitaan valmiiksi. Muuten valitse pysäkki itse.",
  "Add backup stops only if you know they are suitable and familiar for arriving at Home.":
    "Lisää varapysäkkejä vain, jos tiedät, että ne sopivat ja ovat sinulle tuttuja, kun tulet kotiin.",
  "Add backup stops only if you know they are suitable and familiar for arriving at School.":
    "Lisää varapysäkkejä vain, jos tiedät, että ne sopivat ja ovat sinulle tuttuja, kun tulet kouluun.",
  "Add backup stops only if you know they are suitable and familiar for arriving at Work.":
    "Lisää varapysäkkejä vain, jos tiedät, että ne sopivat ja ovat sinulle tuttuja, kun tulet töihin.",
  // Named actions, one per place, so Finnish can put the place in its case.
  "Use my location to set up Home": "Käytä sijaintiani kodin asettamiseen",
  "Use my location to set up School": "Käytä sijaintiani koulun asettamiseen",
  "Use my location to set up Work": "Käytä sijaintiani työpaikan asettamiseen",
  "Use {name} for Home": "Käytä pysäkkiä {name} kodin pysäkkinä",
  "Use {name} for School": "Käytä pysäkkiä {name} koulun pysäkkinä",
  "Use {name} for Work": "Käytä pysäkkiä {name} työpaikan pysäkkinä",
  "Manage Home": "Kodin asetukset",
  "Manage School": "Koulun asetukset",
  "Manage Work": "Työpaikan asetukset",
  "Sharing Home reveals its saved public stop names and numbers, which can indicate the general area.":
    "Jakaminen paljastaa kodin tallennettujen julkisten pysäkkien nimet ja numerot, joista voi päätellä likimääräisen alueen.",
  "Sharing School reveals its saved public stop names and numbers, which can indicate the general area.":
    "Jakaminen paljastaa koulun tallennettujen julkisten pysäkkien nimet ja numerot, joista voi päätellä likimääräisen alueen.",
  "Sharing Work reveals its saved public stop names and numbers, which can indicate the general area.":
    "Jakaminen paljastaa työpaikan tallennettujen julkisten pysäkkien nimet ja numerot, joista voi päätellä likimääräisen alueen.",
  "Only public stop numbers and names are saved; your exact location is discarded.":
    "Vain julkisten pysäkkien numerot ja nimet tallennetaan. Tarkkaa sijaintiasi ei tallenneta.",
  "Using the stop you selected manually": "Käytetään itse valitsemaasi pysäkkiä",
  "Location accuracy ±{accuracy}": "Sijainnin tarkkuus ±{accuracy}",
  "Location accuracy unavailable": "Sijainnin tarkkuus ei ole tiedossa",
  "no stop was preselected — choose and confirm an arrival stop yourself":
    "pysäkkiä ei valittu valmiiksi – valitse ja vahvista saapumispysäkki itse",
  "Main stop": "Pääpysäkki",
  "Yes, this is the right stop for Home.": "Kyllä, tämä on oikea pysäkki kotiin.",
  "Yes, these are the right stops for Home.":
    "Kyllä, nämä ovat oikeat pysäkit kotiin.",
  "Yes, this is the right stop for School.":
    "Kyllä, tämä on oikea pysäkki kouluun.",
  "Yes, these are the right stops for School.":
    "Kyllä, nämä ovat oikeat pysäkit kouluun.",
  "Yes, this is the right stop for Work.": "Kyllä, tämä on oikea pysäkki töihin.",
  "Yes, these are the right stops for Work.":
    "Kyllä, nämä ovat oikeat pysäkit töihin.",

  // A place shared by link
  "Shared place": "Jaettu paikka",
  "Only add places from people you trust. The stops show roughly where this place is, though never an address.":
    "Lisää paikkoja vain henkilöiltä, joihin luotat. Pysäkeistä näkee suunnilleen, missä paikka on, mutta ei koskaan osoitetta.",
  "main stop": "pääpysäkki",
  "Not now": "Ei nyt",

  // A saved place
  "Needs review": "Tarkistettava",
  "stop {id}": "pysäkki {id}",
  "Main stop: {name} · stop {id}":
    "Pääpysäkki: {name} · pysäkki {id}",
  "One or more of its stops are no longer in Föli’s stop list. Check this place before you rely on it.":
    "Yksi tai useampi sen pysäkeistä puuttuu Fölin pysäkkiluettelosta. Tarkista tämä paikka, ennen kuin luotat siihen.",

  "Go to School": "Reitti kouluun",
  "Go to Work": "Reitti töihin",
  "{action} by public transit": "{action} joukkoliikenteellä",
  "Show to driver": "Näytä kuljettajalle",
  "Open School stop": "Avaa koulun pysäkki",
  "Open Work stop": "Avaa työpaikan pysäkki",
  "1 backup stop": "1 varapysäkki",
  "{count} backup stops": "{count} varapysäkkiä",
  "Make main stop": "Tee pääpysäkiksi",

  "Replace using where I am now": "Korvaa nykyisen sijaintini perusteella",
  "Share this place": "Jaa tämä paikka",
  "Remove {label} from My Places?": "Poistetaanko paikka {label} Omista paikoista?",
  "Remove this place": "Poista tämä paikka",
  "Share link for {label}": "Jakolinkki: {label}",
  "{label} · My Places": "{label} · Omat paikat",
  "Link shared.": "Linkki jaettu.",
  "Share link copied.": "Jakolinkki kopioitu.",
  "Copy the share link below.": "Kopioi jakolinkki alta.",

  // Get me Home
  "Travel help": "Matka-apu",
  "Need help getting home?": "Tarvitsetko apua kotimatkalla?",
  "In an emergency, call 112.": "Hätätilanteessa soita 112.",
  "Check Home: one of its stops has changed or is no longer in Föli’s stop list.":
    "Tarkista Koti: tallennettu pysäkki on muuttunut tai poistunut Fölin pysäkkiluettelosta.",
  "Get me Home": "Vie minut kotiin",
  "Get me Home by public transit": "Vie minut kotiin joukkoliikenteellä",
  "Home options": "Kodin valinnat",
  "Fewer options": "Vähemmän valintoja",
  "Open Home stop": "Avaa kotipysäkki",
  "Get me Home opens a route in Google Maps. Check it before you travel.":
    "”Vie minut kotiin” avaa reitin Google Mapsissa. Tarkista reitti ennen lähtöä.",
  "Directions will work once stop locations load. Your saved stop and Show to driver work now.":
    "Reittiohjeet toimivat, kun pysäkkien sijainnit latautuvat. Tallennettu pysäkkisi ja ”Näytä kuljettajalle” toimivat jo nyt.",
  "Directions need an internet connection.": "Reittiohjeet tarvitsevat verkkoyhteyden.",
  "Backup Home stop": "Kodin varapysäkki",
  "Backup Home stops": "Kodin varapysäkit",
  "If the usual stop is unavailable, choose another stop you approved for Home.":
    "Jos tavallista pysäkkiä ei voi käyttää, valitse toinen kotipysäkki, jonka olet hyväksynyt.",
  "Route there: backup Home stop {name}, stop {id}, by public transit":
    "Reitti sinne: kodin varapysäkki {name}, pysäkki {id}, joukkoliikenteellä",
  "Route there": "Reitti sinne",
  "Open stop": "Avaa pysäkki",
  "Print a backup card": "Tulosta varakortti",
  "A web app cannot help after the phone powers off. Print or save a small Home backup card in advance so the destination still exists outside the phone. The card reveals the saved public Home stop area, so keep it only with the intended user.":
    "Verkkosovellus ei voi auttaa, kun puhelimesta on loppunut virta. Tulosta tai tallenna etukäteen pieni varakortti, niin määränpää on tallessa myös puhelimen ulkopuolella. Kortista näkee tallennetun kotipysäkin alueen, joten anna se vain sille, jolle se on tarkoitettu.",
  "Print / save Home backup card": "Tulosta / tallenna kodin varakortti",

  // The printed Home card (its request to the driver stays Finnish)
  "Home backup card": "Kodin varakortti",
  "Show this card to a driver or trusted adult. This card contains public stop information, not a private home address.":
    "Näytä tämä kortti kuljettajalle tai luotettavalle aikuiselle. Kortissa on julkisen pysäkin tiedot, ei kotiosoitetta.",

  // The driver card's own controls (what the driver reads never changes)
  "Show this screen to the driver": "Näytä tämä kuljettajalle",
  "Read aloud in Finnish": "Lue ääneen suomeksi",
  Close: "Sulje",

  // Each place as the object of a button: lower case, as Finnish takes it.
  "Save Home": "Tallenna koti",
  "Add Home": "Lisää koti",
  "Replace Home": "Korvaa koti",
  "Add Home?": "Lisätäänkö koti?",
  "Replace Home?": "Korvataanko koti?",
  "Add Home to My Places": "Lisää koti Omiin paikkoihin",
  "Save School": "Tallenna koulu",
  "Add School": "Lisää koulu",
  "Replace School": "Korvaa koulu",
  "Add School?": "Lisätäänkö koulu?",
  "Replace School?": "Korvataanko koulu?",
  "Add School to My Places": "Lisää koulu Omiin paikkoihin",
  "Save Work": "Tallenna työpaikka",
  "Add Work": "Lisää työpaikka",
  "Replace Work": "Korvaa työpaikka",
  "Add Work?": "Lisätäänkö työpaikka?",
  "Replace Work?": "Korvataanko työpaikka?",
  "Add Work to My Places": "Lisää työpaikka Omiin paikkoihin",
};
