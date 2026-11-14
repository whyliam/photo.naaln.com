'use strict';
// UPYUN's extension fallback treats .mjs as octet-stream. ES modules require JS MIME.
const fs=require('node:fs/promises'),path=require('node:path');
const yaml=require('js-yaml'),UpYun=require('upyun');
async function main(){
  const config=yaml.load(await fs.readFile('_config.yml','utf8'));
  const target=config.deploy;
  if(target.type!=='upyun')throw Error('Expected an UPYUN deploy target');
  const operator=process.env.UPYUN_OPERATOR||target.operator,password=process.env.UPYUN_PASSWORD||target.password;
  if(!operator||!password)throw Error('UPYUN credentials are missing');
  const client=new UpYun.Client(new UpYun.Service(target.bucket,operator,password));
  const root=path.resolve(config.public_dir||'public'),modules=[];
  async function scan(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await scan(file);else if(file.endsWith('.mjs'))modules.push(path.relative(root,file).split(path.sep).join('/'));}}
  await scan(root);
  for(const file of modules){
    const result=await client.putFile(file,await fs.readFile(path.join(root,file)),{'Content-Type':'application/javascript; charset=utf-8'});
    if(result!==true)throw Error('Failed to upload module: '+file);
    console.log('JavaScript MIME set:',file);
  }
  if(modules.length){const urls=modules.map(file=>new URL(file,config.url.replace(/\/?$/,'/')).href);await client.purge(urls);console.log('CDN module cache refreshed:',urls.length);}
}
main().catch(error=>{console.error('UPYUN finalization failed:',error.message);process.exitCode=1;});
