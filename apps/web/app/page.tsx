'use client';
import { useState } from 'react';

type Room = {id:string; number:string; status:string; room_type:string; nightly_rate:string};
const API = 'https://pk-hotels-api.onrender.com/api/v1';

export default function Page() {
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [token,setToken]=useState('');
 const [rooms,setRooms]=useState<Room[]>([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const [view,setView]=useState<'rooms'|'overview'>('overview');
 async function login(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setLoading(true);setError('');
  try {
   const response=await fetch(API+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
   if(!response.ok)throw new Error(response.status===401?'Invalid email or password':'Login unavailable. Contact administrator.');
   const data=await response.json();
   setToken(data.accessToken);setPassword('');
   const roomsResponse=await fetch(API+'/operations/rooms',{headers:{Authorization:'Bearer '+data.accessToken}});
   if(!roomsResponse.ok)throw new Error('Logged in, but room data could not be loaded.');
   setRooms(await roomsResponse.json());
  } catch(err) {setError(err instanceof Error?err.message:'Connection failed');setToken('');}
  finally {setLoading(false);}
 }
 async function refresh(){
  setLoading(true);setError('');
  try {const response=await fetch(API+'/operations/rooms',{headers:{Authorization:'Bearer '+token}});if(response.status===401){setToken('');throw new Error('Session expired. Sign in again.');}if(!response.ok)throw new Error('Rooms could not be refreshed.');setRooms(await response.json());}
  catch(err){setError(err instanceof Error?err.message:'Request failed');}
  finally{setLoading(false);}
 }
 const card:React.CSSProperties={background:'#fff',borderRadius:16,padding:24,boxShadow:'0 5px 25px rgba(18,34,59,.06)'};
 return <main style={{maxWidth:1100,margin:'0 auto',padding:'28px 20px'}}>
  <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:30,flexWrap:'wrap',gap:12}}>
   <div><div style={{color:'#2563eb',fontWeight:800,letterSpacing:2}}>PK-HOTELS</div><h1 style={{margin:'6px 0'}}>Hotel Management</h1></div>
   {token&&<button onClick={()=>{setToken('');setRooms([]);setEmail('');}} style={{padding:12,borderRadius:9,cursor:'pointer'}}>Sign out</button>}
  </header>
  {!token?<section style={{...card,maxWidth:440,margin:'50px auto'}}>
   <h2>Staff sign in</h2><p style={{color:'#64748b'}}>Authorized hotel staff only.</p>
   <form onSubmit={login} style={{display:'grid',gap:14}}>
    <label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" style={{display:'block',width:'100%',boxSizing:'border-box',padding:12,marginTop:7,border:'1px solid #cbd5e1',borderRadius:8}}/></label>
    <label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" style={{display:'block',width:'100%',boxSizing:'border-box',padding:12,marginTop:7,border:'1px solid #cbd5e1',borderRadius:8}}/></label>
    <button disabled={loading} type="submit" style={{background:'#1d4ed8',color:'white',border:0,borderRadius:8,padding:14,cursor:'pointer'}}>{loading?'Signing in…':'Sign in'}</button>
   </form>
  </section>:<>
   <nav style={{display:'flex',gap:10,marginBottom:22}}>
    <button onClick={()=>setView('overview')} style={{padding:12,borderRadius:8,cursor:'pointer'}}>Overview</button>
    <button onClick={()=>setView('rooms')} style={{padding:12,borderRadius:8,cursor:'pointer'}}>Rooms</button>
    <button onClick={refresh} disabled={loading} style={{padding:12,borderRadius:8,cursor:'pointer'}}>Refresh</button>
   </nav>
   {view==='overview'?<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:15}}>
    <div style={card}><div>Total rooms</div><h2>{rooms.length}</h2></div>
    <div style={card}><div>Available</div><h2>{rooms.filter(r=>r.status==='AVAILABLE').length}</h2></div>
    <div style={card}><div>Occupied</div><h2>{rooms.filter(r=>r.status==='OCCUPIED').length}</h2></div>
   </div>:<section style={card}><h2>Room inventory</h2><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}><thead><tr>{['Room','Type','Status','Nightly rate (SAR)'].map(x=><th key={x} style={{padding:12,borderBottom:'1px solid #ddd'}}>{x}</th>)}</tr></thead><tbody>{rooms.map(r=><tr key={r.id}><td style={{padding:12}}>{r.number}</td><td>{r.room_type}</td><td>{r.status}</td><td>{r.nightly_rate}</td></tr>)}</tbody></table></div></section>}
  </>}
  {error&&<p role="alert" style={{color:'#b91c1c',background:'#fee2e2',padding:12,borderRadius:8}}>{error}</p>}
  <footer style={{color:'#64748b',marginTop:40,fontSize:13}}>PK-Hotels • Secure staff access • Reservations and billing modules are being integrated.</footer>
 </main>;
}
