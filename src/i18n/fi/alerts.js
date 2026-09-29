// Service updates: Föli's notices, their labels and the panel around them.
// The notices' own text comes from Föli in the chosen language where Föli
// has it.
/** @import { Dictionary } from "../index" */

/** @type {Dictionary} */
export default {
  // What Föli's effect codes mean
  "No service": "Ei liikennettä",
  "Reduced service": "Supistettu liikenne",
  "Significant delays": "Merkittäviä viivästyksiä",
  Detour: "Poikkeusreitti",
  "Additional service": "Lisävuoroja",
  "Modified service": "Muutoksia liikenteessä",
  "Stop moved": "Pysäkki siirretty",
  "Service update": "Liikennetiedote",
  "Föli service notice": "Fölin tiedote",
  "Emergency service notice": "Liikenteen hätätiedote",
  "Cancelled departure": "Peruttu lähtö",

  // Causes
  "Unknown cause": "Tuntematon syy",
  "Other cause": "Muu syy",
  "Technical problem": "Tekninen vika",
  Strike: "Lakko",
  Demonstration: "Mielenosoitus",
  Accident: "Onnettomuus",
  Holiday: "Juhlapyhä",
  Weather: "Sääolosuhteet",
  Maintenance: "Huoltotyöt",
  "Construction work": "Rakennustyöt",
  "Police activity": "Poliisitehtävä",
  "Medical emergency": "Sairaskohtaus",

  // The panel
  "Valid until {date}, {time}": "Voimassa {date} klo {time} asti",
  "Line {line}": "Linja {line}",
  "Lines {lines}": "Linjat {lines}",
  "A departure": "Lähtö",
  "All Föli services": "Koko Fölin liikenne",
  "Open full image for {title}": "Avaa koko kuva: {title}",
  "{title} illustration": "Kuva: {title}",
  "Open full image": "Avaa koko kuva",
  "Before you go": "Ennen lähtöä",
  "Couldn’t check service updates":
    "Liikennetiedotteita ei saatu tarkistettua",
  "Some disruptions may not show": "Kaikki häiriöt eivät ehkä näy",
  "last checked {age}": "viimeksi tarkistettu {age}",
  "Departure times are checked separately.":
    "Lähtöajat tarkistetaan erikseen.",
  "Important now": "Tärkeää nyt",
  "Emergency notice": "Hätätiedote",
  "Service updates": "Liikennetiedotteet",
  "1 service update": "1 liikennetiedote",
  "{count} service updates": ({ count }) => `${count} liikennetiedotetta`,
  "Update failed": "Päivitys epäonnistui",
  "Service updates may be out of date": "Liikennetiedotteet voivat olla vanhentuneita",
  "Show fewer updates": "Näytä vähemmän",
  "Hide service updates": "Piilota liikennetiedotteet",
  "Show 1 more update": "Näytä 1 tiedote lisää",
  "Show {count} more updates": ({ count }) => `Näytä ${count} tiedotetta lisää`,
};
