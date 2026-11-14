'use strict';
// UPYUN's extension fallback treats .mjs as octet-stream. ES modules require JS MIME.
// Uploaded paths can also keep an older CDN object, so refresh every mutable
// asset and each generated page's canonical URL after the upload completes.
const fs=require('node:fs/promises'),path=require('node:path');
const http=require('node:http');
const yaml=require('js-yaml'),UpYun=require('upyun');
const PURGE_BATCH_SIZE=30;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function purge(client,urls){
  // upyun@3.4.6 sends this form value without escaping it. Percent-encoded
  // paths are then decoded by the server before signature verification and
  // produce a misleading 401. Encode the form field while signing raw URLs.
  const endpoint=new URL('http://purge.upyun.com/purge/');
  const body=new URLSearchParams({purge:urls.join('\n')}).toString();
  const headers={...UpYun.sign.getPurgeHeaderSign(client.service,urls),'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)};
  const proxy=client.proxy;
  const options=proxy
    ? {host:proxy.host,port:proxy.port,path:endpoint.href,method:'POST',headers:{...headers,Host:endpoint.host}}
    : {host:endpoint.hostname,port:endpoint.port||80,path:endpoint.pathname,method:'POST',headers};
  return new Promise((resolve,reject)=>{
    const request=http.request(options,response=>{
      let data='';
      response.setEncoding('utf8');
      response.on('data',chunk=>{data+=chunk;});
      response.on('end',()=>{
        if(response.statusCode!==200){reject(new Error(`request failed with status code ${response.statusCode}`));return;}
        try{
          const result=JSON.parse(data),invalid=result.invalid_domain_of_url||{};
          if(Object.keys(invalid).length)throw Error(`invalid purge domain: ${Object.keys(invalid).join(', ')}`);
          resolve(true);
        }catch(error){reject(error);}
      });
    });
    request.setTimeout(15000,()=>request.destroy(new Error('request timed out')));
    request.on('error',reject);
    request.end(body);
  });
}

async function purgeInBatches(client,urls,attempts){
  for(let offset=0;offset<urls.length;offset+=PURGE_BATCH_SIZE){
    const batch=urls.slice(offset,offset+PURGE_BATCH_SIZE);
    for(let attempt=1;;attempt++){
      try{await purge(client,batch);break;}
      catch(error){
        if(attempt>=attempts)throw new Error(`CDN purge failed for batch ${offset/PURGE_BATCH_SIZE+1}: ${error.message}`);
        await delay(250*2**(attempt-1));
      }
    }
    console.log('CDN cache batch refreshed:',batch.length);
    if(offset+batch.length<urls.length)await delay(350);
  }
}

async function main(){
  const config=yaml.load(await fs.readFile('_config.yml','utf8'));
  const target=config.deploy;
  if(target.type!=='upyun')throw Error('Expected an UPYUN deploy target');
  const operator=process.env.UPYUN_OPERATOR||target.operator,password=process.env.UPYUN_PASSWORD||target.password;
  if(!operator||!password)throw Error('UPYUN credentials are missing');
  const client=new UpYun.Client(new UpYun.Service(target.bucket,operator,password));
  const root=path.resolve(config.public_dir||'public'),modules=[],purgeUrls=new Set();
  const siteRoot=new URL(config.url.replace(/\/?$/,'/'));
  async function scan(dir){
    for(const entry of await fs.readdir(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name);
      if(entry.isDirectory()){await scan(file);continue;}
      const relative=path.relative(root,file).split(path.sep).join('/'),extension=path.extname(file).toLowerCase();
      if(extension==='.mjs')modules.push(relative);
      if(['.css','.js','.mjs'].includes(extension))purgeUrls.add(new URL(relative,siteRoot).href);
      if(extension==='.html'){
        const html=await fs.readFile(file,'utf8');
        const match=html.match(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
        if(match){
          const canonical=new URL(match[1],siteRoot);
          if(canonical.origin!==siteRoot.origin)throw Error(`Canonical URL is outside the site: ${relative}`);
          purgeUrls.add(canonical.href);
        }
      }
    }
  }
  await scan(root);
  for(const file of modules){
    const result=await client.putFile(file,await fs.readFile(path.join(root,file)),{'Content-Type':'application/javascript; charset=utf-8'});
    if(result!==true)throw Error('Failed to upload module: '+file);
    console.log('JavaScript MIME set:',file);
  }
  const urls=[...purgeUrls];
  if(urls.length){await purgeInBatches(client,urls,Math.max(1,Number(target.try_times)||3));console.log('CDN cache refreshed:',urls.length);}
}
main().catch(error=>{console.error('UPYUN finalization failed:',error.message);process.exitCode=1;});
