import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

function parseEnv(path){
  const out={};
  const lines=readFileSync(path,'utf8').split(/\r?\n/);
  for(const line of lines){
    if(!line || line.trim().startsWith('#')) continue;
    const i=line.indexOf('=');
    if(i===-1) continue;
    out[line.slice(0,i).trim()] = line.slice(i+1).trim();
  }
  return out;
}

const env=parseEnv('.env.local');
const cfg={
  apiKey: env.PUBLIC_FIREBASE_API_KEY,
  authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.PUBLIC_FIREBASE_APP_ID
};
console.log('Using project', cfg.projectId);

const app=initializeApp(cfg);
const auth=getAuth(app);
const db=getFirestore(app);
const timeout=(ms,label)=>new Promise((_,rej)=>setTimeout(()=>rej(new Error(`Timeout:${label}:${ms}ms`)),ms));

try{
  const cred=await Promise.race([signInAnonymously(auth), timeout(10000,'signInAnonymously')]);
  const uid=cred.user.uid;
  console.log('signed in uid', uid);

  const rid='diag'+Math.random().toString(36).slice(2,10);
  const batch=writeBatch(db);
  batch.set(doc(db,'reservations',rid),{clubName:'Diag',startAt:Timestamp.now(),tableType:'VIP',capacity:6,notes:'diag',dressCode:'',hostUid:uid,createdAt:serverTimestamp(),debugEnabled:true,debugTokenHash:'x'});
  batch.set(doc(db,'reservationPublic',rid),{reservationId:rid,clubName:'Diag',startAt:Timestamp.now(),tableType:'VIP',capacity:6,notes:'diag',dressCode:'',debugEnabled:true,acceptedCount:0,declinedCount:0,updatedAt:serverTimestamp()});
  batch.set(doc(db,'reservationDebug',rid),{reservationId:rid,hostUid:uid,debugTokenHash:'x',createdAt:serverTimestamp()});

  await Promise.race([batch.commit(), timeout(12000,'batch.commit')]);
  console.log('batch commit success', rid);
}catch(err){
  console.error('ERROR', err?.code || '', err?.message || err);
  process.exitCode=1;
}