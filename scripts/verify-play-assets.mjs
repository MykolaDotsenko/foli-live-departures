import fs from "node:fs";

function pngDimensions(buffer){
  if(buffer.toString("ascii",1,4)!=="PNG") throw new Error("Not a PNG.");
  return {width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)};
}

function jpegDimensions(buffer){
  if(buffer[0]!==0xff || buffer[1]!==0xd8) throw new Error("Not a JPEG.");
  let offset=2;
  while(offset<buffer.length){
    if(buffer[offset]!==0xff){offset+=1;continue;}
    const marker=buffer[offset+1];
    offset+=2;
    if(marker===0xd9 || marker===0xda) break;
    const length=buffer.readUInt16BE(offset);
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
      return {height:buffer.readUInt16BE(offset+3),width:buffer.readUInt16BE(offset+5)};
    }
    offset+=length;
  }
  throw new Error("JPEG size marker not found.");
}

const failures=[];
const iconPath="artifacts/play-store/app-icon.png";
const iconBuffer=fs.readFileSync(iconPath);
const icon=pngDimensions(iconBuffer);
if(icon.width!==512||icon.height!==512) failures.push(`app icon is ${icon.width}x${icon.height}, expected 512x512`);
if(iconBuffer.length>1024*1024) failures.push(`app icon is ${iconBuffer.length} bytes, above Google Play's 1024KB limit`);
if(iconBuffer[24]!==8 || iconBuffer[25]!==6) failures.push("app icon must be an 8-bit RGBA (32-bit) PNG");
const featurePath="artifacts/play-store/feature-graphic.jpg";
const featureBuffer=fs.readFileSync(featurePath);
const feature=jpegDimensions(featureBuffer);
if(feature.width!==1024||feature.height!==500) failures.push(`feature graphic is ${feature.width}x${feature.height}, expected 1024x500`);

for(const name of ["phone-01-board.jpg","phone-02-ride-setup.jpg","phone-03-ride-now.jpg","phone-04-privacy.jpg"]){
  const buffer=fs.readFileSync(`artifacts/play-store/${name}`);
  if(buffer.length>8*1024*1024) failures.push(`${name} is above Google Play's 8MB screenshot limit`);
  const size=jpegDimensions(buffer);
  if(size.width<1080) failures.push(`${name} width ${size.width} is below 1080`);
  if(Math.max(size.width,size.height)>3840) failures.push(`${name} exceeds Google Play's 3840px maximum dimension`);
  if(Math.min(size.width,size.height)<320) failures.push(`${name} is below Google Play's 320px minimum dimension`);
  if(Math.abs(size.width/size.height-9/16)>0.002){
    failures.push(`${name} is ${size.width}x${size.height}, expected 9:16`);
  }
  if(Math.max(size.width,size.height)>2*Math.min(size.width,size.height)){
    failures.push(`${name} violates Google Play's 2:1 maximum dimension ratio`);
  }
}
if(failures.length) throw new Error(["Google Play generated asset verification failed:",...failures.map(f=>`- ${f}`)].join("\n"));
console.log("Google Play generated assets verified: <=1MB 512x512 32-bit icon, 1024x500 JPEG feature graphic and four <=8MB >=1080px 9:16 JPEG phone screenshots.");
