import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const failures=[];
const title=read("play/listings/en-US/title.txt").trim();
const shortDescription=read("play/listings/en-US/short-description.txt").trim();
const fullDescription=read("play/listings/en-US/full-description.txt").trim();
const releaseNotes=read("play/release-notes/en-US/default.txt").trim();
const dataSafety=read("play/DATA_SAFETY.md");
const playReadme=read("play/README.md");
const contact=JSON.parse(read("play/contact.json"));
const altText=JSON.parse(read("play/alt-text.en-US.json"));
const privacy=read("public/privacy.html");
const privacyText=privacy.replace(/\s+/g," ");
// The in-app trust surface (contact, source, privacy policy) is the footer.
const app=read("src/app/AppFooter.jsx");
const releaseWorkflow=read(".github/workflows/android-release.yml");
const apkWorkflow=read(".github/workflows/android-apk.yml");
const e2eWorkflow=read(".github/workflows/android-e2e.yml");
const screenshotSpec=read("e2e/play-store-screenshots.spec.js");
const assetManifest=JSON.parse(read("play/assets.json"));

function max(text,limit,label){
  if([...text].length>limit) failures.push(`${label} exceeds ${limit} characters.`);
}
max(title,30,"Play title");
max(shortDescription,80,"Play short description");
max(fullDescription,4000,"Play full description");
max(releaseNotes,500,"Play release notes");

if(title!=="Turku Departures") failures.push("Play title must match canonical product name.");
for(const token of ["independent","privacy-first","Föli open data","not made by or affiliated","No account"]){
  if(!fullDescription.includes(token)) failures.push(`Full description missing trust token: ${token}`);
}
for(const token of [
  "pre-submission worksheet",
  "Do not submit a blanket **“No data collected or shared”**",
  "Precise / approximate device location",
  "In-app stop search text",
  "data.foli.fi",
  "ACCESS_BACKGROUND_LOCATION",
  "prepared, not approved"
]){
  if(!dataSafety.includes(token)) failures.push(`Data Safety worksheet missing: ${token}`);
}
for(const token of [
  "No advertising SDK or analytics SDK",
  "Raw device coordinates are not saved",
  "does not request Android background-location permission",
  "data.foli.fi",
  "docnikolaj1990@gmail.com",
  "remove locally stored data"
]){
  if(!privacyText.includes(token)) failures.push(`Privacy policy missing: ${token}`);
}
if(!app.includes('privacy.html')) failures.push("In-app trust surface must link the public privacy policy.");

if(contact.supportEmail!=="docnikolaj1990@gmail.com") failures.push("Play support email drifted.");
if(contact.privacyPolicyUrl!=="https://mykoladotsenko.github.io/foli-live-departures/privacy.html") failures.push("Play privacy-policy URL drifted.");
if(contact.websiteUrl!=="https://mykoladotsenko.github.io/foli-live-departures/") failures.push("Play website URL drifted.");
if(!playReadme.includes("public/icon-512.png")) failures.push("Play README must name the canonical PNG icon source.");
if(playReadme.includes("public/icon-512.jpg")) failures.push("Play README contains the invalid JPG icon source.");
for(const [key,value] of Object.entries(altText)){
  if(!String(value).trim()) failures.push(`Play alt text is empty: ${key}`);
  if([...String(value)].length>140) failures.push(`Play alt text exceeds 140 characters: ${key}`);
}
for(const key of ["feature-graphic","phone-01-board","phone-02-ride-setup","phone-03-ride-now","phone-04-privacy"]){
  if(!(key in altText)) failures.push(`Play alt text missing: ${key}`);
}

const icon=fs.readFileSync(path.join(root,assetManifest.storeIcon.source));
if(icon.toString("ascii",1,4)!=="PNG") failures.push("Play store icon source must be PNG.");
if(icon.readUInt32BE(16)!==512 || icon.readUInt32BE(20)!==512){
  failures.push("Play store icon must be exactly 512x512.");
}
if(assetManifest.phoneScreenshots.length<4) failures.push("Play surface must define at least four phone screenshots.");
for(const shot of assetManifest.phoneScreenshots){
  if(!screenshotSpec.includes(shot)) failures.push(`Screenshot generator missing ${shot}`);
}

for(const [label,source] of [
  ["APK",apkWorkflow],
  ["E2E",e2eWorkflow],
  ["release",releaseWorkflow]
]){
  if(!source.includes("@capacitor/android@8.5.2")) failures.push(`${label} workflow must pin Capacitor Android 8.5.2.`);
  if(!source.includes("npm run verify:android-play-target")) failures.push(`${label} workflow must verify generated API-36 Play target.`);
}
if(!releaseWorkflow.includes("bundleRelease")) failures.push("Production release must build an AAB.");
if(!releaseWorkflow.includes("android-production")) failures.push("Production release must remain protected by the signing environment.");

if(failures.length){
  throw new Error(["Google Play release-surface verification failed:",...failures.map(f=>`- ${f}`)].join("\n"));
}
console.log("Google Play release surface verified: listing limits, public privacy policy, conservative Data Safety worksheet, 512px icon, reproducible screenshots/feature graphic contract, API-36 Android target verification and signed AAB release path are enforced.");
