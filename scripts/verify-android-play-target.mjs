import fs from "node:fs";
import path from "node:path";

export function verifyAndroidPlayTarget({ variables, appGradle, manifest }) {
  const failures=[];
  if(!/compileSdkVersion\s*=\s*36\b/.test(variables)){
    failures.push("compileSdkVersion must be 36.");
  }
  if(!/targetSdkVersion\s*=\s*36\b/.test(variables)){
    failures.push("targetSdkVersion must be 36.");
  }
  if(!/minSdkVersion\s*=\s*24\b/.test(variables)){
    failures.push("Capacitor 8 minimum SDK must remain 24.");
  }
  if(!/applicationId\s+["']io\.github\.mykoladotsenko\.turkudepartures["']/.test(appGradle)){
    failures.push("Android applicationId drifted from the Play package ID.");
  }
  if(/android\.permission\.ACCESS_BACKGROUND_LOCATION/.test(manifest)){
    failures.push("Play build must not request ACCESS_BACKGROUND_LOCATION.");
  }
  if(!/android\.permission\.FOREGROUND_SERVICE_LOCATION/.test(manifest)){
    failures.push("Play build must declare FOREGROUND_SERVICE_LOCATION.");
  }
  if(failures.length) throw new Error(failures.join("\n"));
  return true;
}

if(process.argv[1]?.endsWith("verify-android-play-target.mjs")){
  const root=process.cwd();
  verifyAndroidPlayTarget({
    variables:fs.readFileSync(path.join(root,"android/variables.gradle"),"utf8"),
    appGradle:fs.readFileSync(path.join(root,"android/app/build.gradle"),"utf8"),
    manifest:fs.readFileSync(path.join(root,"android/app/src/main/AndroidManifest.xml"),"utf8"),
  });
  console.log("Generated Android Play target verified: compile/target API 36, min API 24, stable package ID, typed foreground-location service and no background-location permission.");
}
