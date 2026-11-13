'use strict';
const fs=require('fs');
module.exports=function rotatingLog(file,max=10*1024*1024,keep=5){
 let size=fs.existsSync(file)?fs.statSync(file).size:0;
 return {write(chunk){
  if(size+chunk.length>max){for(let n=keep;n>=1;n--){const from=n===1?file:file+'.'+(n-1),to=file+'.'+n;if(fs.existsSync(from)){if(fs.existsSync(to))fs.unlinkSync(to);fs.renameSync(from,to);}}size=0;}
  fs.appendFileSync(file,chunk);size+=chunk.length;
 }};
};
