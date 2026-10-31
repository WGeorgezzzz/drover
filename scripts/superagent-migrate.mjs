import { existsSync,readFileSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { parseArgs } from 'node:util';
import Database from 'better-sqlite3';
import { SuperagentStore } from '../dist-server/server/modules/superagent/store.js';
import { SuperagentMigration } from '../dist-server/server/modules/superagent/migration.js';
const {values}=parseArgs({options:{database:{type:'string'},root:{type:'string',multiple:true},owner:{type:'string',default:'1'},apply:{type:'boolean'},rollback:{type:'boolean'}}});
if(!values.database)throw new Error('--database is required; production is never selected implicitly');
const database=resolve(values.database),root=join(dirname(database),'superagent'),lock=join(root,'writer.lock');
if(existsSync(lock)){const owner=JSON.parse(readFileSync(lock,'utf8'));try{process.kill(owner.pid,0);throw new Error('Stop the target server before offline migration');}catch(error){if(error.code!=='ESRCH')throw error;}}
const db=new Database(database,{fileMustExist:true});
try{if(values.apply||values.rollback)await db.backup(database+'.superagent-'+Date.now()+'.bak');const migration=new SuperagentMigration(new SuperagentStore(db),Number(values.owner),root);console.log(JSON.stringify(values.rollback?migration.rollback():values.apply?migration.apply(values.root??[]):migration.preview(values.root??[]),null,2));}finally{db.close();}
