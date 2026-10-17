import { Pool } from 'pg';
import * as argon2 from 'argon2';

async function main() {
 const email=process.env.ADMIN_EMAIL?.trim().toLowerCase();
 const password=process.env.ADMIN_PASSWORD;
 if(!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))throw new Error('Set a valid ADMIN_EMAIL');
 if(!password || password.length<14)throw new Error('Set ADMIN_PASSWORD (14+ characters)');
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='true'?{rejectUnauthorized:true}:undefined});
 try {
  const hotel=(await pool.query('SELECT id FROM hotels WHERE name=$1',['PK-Hotels'])).rows[0];
  if(!hotel)throw new Error('PK-Hotels record missing; verify database migrations');
  const hash=await argon2.hash(password,{type:argon2.argon2id});
  const result=await pool.query("INSERT INTO staff(hotel_id,email,password_hash,role) VALUES($1,$2,$3,'ADMIN') ON CONFLICT(email) DO NOTHING RETURNING id",[hotel.id,email,hash]);
  if(result.rowCount!==1)throw new Error('Admin email already exists; no credentials were changed');
  console.log('Initial admin account created successfully');
 }finally{await pool.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
