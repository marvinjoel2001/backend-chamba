// Real PostgreSQL regression. Only connects to the dedicated local QA database;
// all tables are isolated in a newly generated schema and removed afterwards.
require('reflect-metadata');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DataSource } = require('typeorm');
const { MobileOffersService } = require('../dist/modules/mobile/services/mobile-offers.service');
const schema = 'qa_decline_' + crypto.randomBytes(6).toString('hex');
assert.match(schema, /^qa_decline_[a-f0-9]{12}$/);
const database = 'chamba_qa_20261007';
const db = new DataSource({ type:'postgres', host:'127.0.0.1', port:55432,
  username:'chamba_qa', password:'qa-local-only', database,
  extra:{ options:`-c search_path=${schema}` }, entities:[], synchronize:false });
const cases=[];
const REQUEST=crypto.randomUUID(), WORKER=crypto.randomUUID(), CLIENT=crypto.randomUUID(), OFFER=crypto.randomUUID();
async function seed(status='searching', offerStatus='pending') {
  await db.query('TRUNCATE chat_threads,job_offers,job_requests,users');
  await db.query('INSERT INTO users(id) VALUES ($1),($2)',[WORKER,CLIENT]);
  await db.query('INSERT INTO job_requests(id,client_user_id,title,status,budget) VALUES ($1,$2,$3,$4,100)', [REQUEST,CLIENT,'QA isolated',status]);
  if(offerStatus) await db.query('INSERT INTO job_offers(id,request_id,worker_user_id,amount,status) VALUES ($1,$2,$3,110,$4)', [OFFER,REQUEST,WORKER,offerStatus]);
}
async function snapshot() {
  return (await db.query(`SELECT jr.status, (SELECT COUNT(*)::int FROM job_offers WHERE status='accepted') AS accepted,
    (SELECT status FROM job_offers LIMIT 1) AS offer_status FROM job_requests jr`))[0];
}
async function main(){
  let created=false;
  await db.initialize();
  try {
    assert.equal((await db.query('SELECT current_database() AS name'))[0].name,database);
    await db.query(`CREATE SCHEMA "${schema}"`); created=true;
    await db.query(`CREATE TABLE users(id uuid PRIMARY KEY);
      CREATE TABLE job_requests(id uuid PRIMARY KEY,client_user_id uuid,title text,status text,budget numeric,updated_at timestamptz);
      CREATE TABLE job_offers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid,worker_user_id uuid,
        amount numeric,status text,expires_at timestamptz,UNIQUE(request_id,worker_user_id));
      CREATE TABLE chat_threads(request_id uuid,client_user_id uuid,worker_user_id uuid,updated_at timestamptz,
        client_deleted boolean DEFAULT false,worker_deleted boolean DEFAULT false,UNIQUE(request_id,client_user_id,worker_user_id));
      CREATE TABLE push_tokens(user_id uuid,token text,last_seen_at timestamptz);`);
    const service=new MobileOffersService(db,{notifyOfferRejected:async()=>{}},
      {emitToUser(){},broadcastRequest(){}},{expireStaleOffers:async()=>{}});
    service.notifyWorkerOfAcceptedOffer=async()=>{};
    const input={requestId:REQUEST,workerUserId:WORKER};
    for(const offerStatus of [null,'pending','expired','declined']){
      await seed('searching',offerStatus);await service.declineOffer(input);
      assert.equal((await snapshot()).offer_status,'declined');cases.push({case:'decline '+offerStatus,passed:true});
    }
    for(const state of ['assigned','completed','cancelled','expired']){
      await seed(state,'accepted');await assert.rejects(service.declineOffer(input), e=>e.getStatus()===400);
      assert.equal((await snapshot()).offer_status,'accepted');cases.push({case:'guard '+state,passed:true});
    }
    await seed('searching','accepted');
    await assert.rejects(service.declineOffer(input),e=>e.getStatus()===400);
    assert.equal((await snapshot()).offer_status,'accepted');cases.push({case:'accepted conflict cannot be overwritten',passed:true});
    // Hold the actual acceptOffer transaction after it has acquired the row
    // lock, then start declineOffer while acceptance is still uncommitted.
    await seed();
    const originalRunner = db.createQueryRunner.bind(db);
    let acquired, release;
    const acquiredPromise = new Promise(resolve=>{acquired=resolve});
    const releasePromise = new Promise(resolve=>{release=resolve});
    db.createQueryRunner = (...args)=>{
      const runner=originalRunner(...args), query=runner.query.bind(runner);
      runner.query=async(sql,...params)=>{
        const rows=await query(sql,...params);
        if(sql.includes('SELECT jr.id') && sql.includes('FOR UPDATE')){acquired();await releasePromise;}
        return rows;
      };
      return runner;
    };
    try {
      const accepted=service.acceptOffer({offerId:OFFER,clientUserId:CLIENT});
      await acquiredPromise;
      const declined=service.declineOffer(input).then(value=>({ok:true,value}),error=>({ok:false,status:error.getStatus()}));
      await new Promise(resolve=>setTimeout(resolve,40));
      release(); await accepted;
      assert.deepEqual(await declined,{ok:false,status:400});
      const state=await snapshot(); assert.equal(state.status,'assigned'); assert.equal(state.accepted,1);
      cases.push({case:'accept locks first: concurrent decline waits and leaves tracking winner intact',passed:true,state});
    } finally {release();db.createQueryRunner=originalRunner;}
    for(let i=0;i<10;i++){
      await seed();
      const race=await Promise.allSettled([
        service.acceptOffer({offerId:OFFER,clientUserId:CLIENT}),service.declineOffer(input),
      ]);
      assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
      const state=await snapshot();
      if(state.status==='assigned'){assert.equal(state.accepted,1);assert.equal(state.offer_status,'accepted');}
      else {assert.equal(state.status,'searching');assert.equal(state.offer_status,'declined');}
      cases.push({case:'concurrent accept/decline '+(i+1),passed:true,state});
    }
    const evidence=path.resolve(__dirname,'../../PRUEBAS_CHAMBA_CORRECCIONES_2026-10-13');
    fs.mkdirSync(evidence,{recursive:true});
    fs.writeFileSync(path.join(evidence,'postgres-decline-regression.json'),JSON.stringify({database,source:'local compiled MobileOffersService',cases},null,2));
    console.log(`PASS ${cases.length} PostgreSQL cases; accepted offers and assigned requests remain consistent.`);
  } finally {
    if(created) await db.query(`DROP SCHEMA "${schema}" CASCADE`);
    await db.destroy();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1});
