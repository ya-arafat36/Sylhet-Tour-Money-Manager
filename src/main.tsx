import React,{useEffect,useMemo,useState} from "react";
import {createRoot} from "react-dom/client";
import {createClient,Session} from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import "./style.css";

const SUPABASE_URL=import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const sb=SUPABASE_URL&&SUPABASE_KEY?createClient(SUPABASE_URL,SUPABASE_KEY):null;
const defaults=[["🚆","Train / Railway"],["🏨","Hotel / Accommodation"],["🍽️","Food"],["🚕","Transport"],["🎟️","Tickets / Entry"],["🛍️","Shopping"],["🥤","Drinks / Water"],["📦","Others"]];
const money=(n:number)=>`৳${Number(n||0).toLocaleString("en-BD",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
type Exp={id:string;category:string;name:string;amount:number;note:string;created_at:string};
type Member={id:string;name:string;position:number};
type Cred={id:string;member_id:string;username:string;active:boolean};

function App(){
 const [session,setSession]=useState<Session|null>(null),[mode,setMode]=useState<"admin"|"member"|"">(""),[fund,setFund]=useState(35000);
 const [members,setMembers]=useState<Member[]>([]),[expenses,setExpenses]=useState<Exp[]>([]),[cats,setCats]=useState(defaults),[tab,setTab]=useState("dashboard"),[loading,setLoading]=useState(false);
 const [login,setLogin]=useState({email:"",password:""}),[memberLogin,setMemberLogin]=useState({username:"",pin:""}),[setup,setSetup]=useState(false),[memberIdentity,setMemberIdentity]=useState<{id:string;name:string;position:number}|null>(null);
 const [credentials,setCredentials]=useState<Cred[]>([]);
 const n=members.length||7,total=expenses.reduce((s,e)=>s+Number(e.amount),0),rem=fund-total,pp=total/n,ppr=rem/n;

 async function load(currentSession?:Session|null){
   if(!sb){setSetup(true);return}
   const {data:{session:s}}=await sb.auth.getSession();const activeSession=currentSession??s;setSession(activeSession);
   if(activeSession){
     const isAdmin=activeSession.user.app_metadata?.role==="admin";
     setMode(isAdmin?"admin":"member");
     const [m,e,c,f,cr]=await Promise.all([
       sb.from("members").select("*").order("position"),
       sb.from("expenses").select("*").order("created_at",{ascending:false}),
       sb.from("categories").select("*").order("name"),
       sb.from("settings").select("*").eq("key","funding").maybeSingle(),
       isAdmin?sb.rpc("get_member_credentials"):Promise.resolve({data:[],error:null})
     ]);
     if(m.data?.length)setMembers(m.data);if(e.data)setExpenses(e.data);if(c.data?.length)setCats(c.data.map((x:any)=>[x.icon,x.name]));if(f.data)setFund(Number(f.data.value));if(cr.data)setCredentials(cr.data);
   }
 }
 useEffect(()=>{load()},[]);
 useEffect(()=>{if(!sb)return;const ch=sb.channel("trip-live").on("postgres_changes",{event:"*",schema:"public",table:"expenses"},()=>load()).on("postgres_changes",{event:"*",schema:"public",table:"members"},()=>load()).on("postgres_changes",{event:"*",schema:"public",table:"settings"},()=>load()).on("postgres_changes",{event:"*",schema:"public",table:"categories"},()=>load()).subscribe();return()=>{sb.removeChannel(ch)}},[session]);
 async function signInAdmin(e:React.FormEvent){e.preventDefault();if(!sb){alert("Supabase is not configured yet.");return}setLoading(true);const {data,error}=await sb.auth.signInWithPassword(login);setLoading(false);if(error)alert(error.message);else load(data.session)}
 async function signInMember(e:React.FormEvent){e.preventDefault();if(!sb)return;setLoading(true);const {data,error}=await sb.rpc("verify_member_login",{p_username:memberLogin.username,p_pin:memberLogin.pin});if(error){setLoading(false);alert(error.message);return}if(!data?.length){setLoading(false);alert("Username or PIN is incorrect.");return}const row=data[0];localStorage.setItem("sylhet_member",JSON.stringify({id:row.member_id,name:row.member_name,position:row.member_position}));setMemberIdentity({id:row.member_id,name:row.member_name,position:row.member_position});const anon=await sb.auth.signInAnonymously();setLoading(false);if(anon.error){alert("Member login verified, but Anonymous Sign-Ins are not enabled in Supabase. Enable it in Authentication settings.");return}load(anon.data.session)}
 async function signOut(){localStorage.removeItem("sylhet_member");setMemberIdentity(null);await sb?.auth.signOut();setSession(null);setMode("")}
 async function addExpense(){
   if(!sb||mode!=="admin")return;const category=prompt("Category:\n\n"+cats.map(c=>c[1]).join("\n"));if(!category)return;const name=prompt("Expense name?");if(!name)return;const amount=Number(prompt("Amount (৳)?"));if(!amount)return;const note=prompt("Note (optional)")||"";
   const {error}=await sb.from("expenses").insert({category,name,amount,note});if(error)alert(error.message);else load();
 }
 async function saveMember(m:Member,name:string){if(!sb||mode!=="admin"||!name.trim())return;const {error}=await sb.from("members").update({name:name.trim()}).eq("id",m.id);if(error)alert(error.message);else load()}
 async function saveCredential(memberId:string,username:string,pin:string){if(!sb||mode!=="admin")return;const clean=username.trim().toLowerCase();if(!clean)return;const payload:any={member_id:memberId,username:clean};if(pin.trim())payload.pin_hash=`__PIN__${pin.trim()}`; // replaced below by secure RPC
   const {error}=await sb.rpc("admin_set_member_login",{p_member_id:memberId,p_username:clean,p_pin:pin.trim()});if(error)alert(error.message);else load();
 }
 function exportExcel(){const history=expenses.map((e,i)=>({"#":i+1,"Date & Time":new Date(e.created_at).toLocaleString(),"Category":e.category,"Expense":e.name,"Amount":Number(e.amount),"Per Person":Number(e.amount)/n,"Note":e.note||""}));const wb=XLSX.utils.book_new();const summary=XLSX.utils.json_to_sheet([{Metric:"Total Funding",Amount:fund},{Metric:"Total Expense",Amount:total},{Metric:"Per Person Expense",Amount:pp},{Metric:"Group Remaining",Amount:rem},{Metric:"Remaining / Person",Amount:ppr},{Metric:"Members",Amount:n}]);const ws=XLSX.utils.json_to_sheet(history);const catRows=cats.map(c=>{const v=expenses.filter(e=>e.category===c[1]).reduce((s,e)=>s+Number(e.amount),0);return {Category:c[1],"Total Spend":v,"Per Person":v/n}});XLSX.utils.book_append_sheet(wb,summary,"Summary");XLSX.utils.book_append_sheet(wb,ws,"Expense History");XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(catRows),"Category Summary");XLSX.writeFile(wb,"Sylhet_Tour_Expense_Report.xlsx")}
 function exportPDF(){const d=new jsPDF();d.setFontSize(18);d.text("SYLHET TOUR — GROUP EXPENSE REPORT",14,18);d.setFontSize(10);d.text(`Members: ${n}   Total Funding: ${money(fund)}   Total Expense: ${money(total)}`,14,26);autoTable(d,{startY:32,head:[["#","Date & Time","Category","Expense","Amount","Per Person"]],body:expenses.map((e,i)=>[i+1,new Date(e.created_at).toLocaleString(),e.category,e.name,money(e.amount),money(Number(e.amount)/n)])});let y=(d as any).lastAutoTable.finalY+12;d.text(`Total Expense: ${money(total)}`,14,y);d.text(`Group Remaining Balance: ${money(rem)}`,14,y+7);d.text(`Remaining Balance / Person: ${money(ppr)}`,14,y+14);d.save("Sylhet_Tour_Expense_Report.pdf")}

 if(setup)return <Setup/>;
 if(!session)return <Login login={login} setLogin={setLogin} memberLogin={memberLogin} setMemberLogin={setMemberLogin} submitAdmin={signInAdmin} submitMember={signInMember} loading={loading}/>;
 return <div className="app"><header><div><small>SYLHET TOUR • GROUP FINANCE</small><h1>Sylhet Tour Money Manager</h1><p>Every Taka. Every Expense. One Clear Trip.</p></div><div className="headerRight"><span className={mode==="admin"?"admin":"view"}>{mode==="admin"?"👑 ADMIN":`👁 VIEW ONLY${memberIdentity?` • ${memberIdentity.name}`:""}`}</span><button onClick={signOut}>Sign out</button></div></header>
 <section className="stats">{[["💰","Total Funding",fund],["💸","Total Expense",total],["👤","Per Person Expense",pp],["💰","Group Remaining",rem],["👤","Per Person Remaining",ppr],["👥","Members",n]].map((x:any)=><div className="stat" key={x[1]}><small>{x[0]} {x[1]}</small><b>{x[1]==="Members"?x[2]:money(Number(x[2]))}</b></div>)}</section>
 <nav>{["dashboard","categories","history","members","admin"].filter(x=>x!=="admin"||mode==="admin").map(x=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x==="dashboard"?"🏠 Dashboard":x==="categories"?"📁 Categories":x==="history"?"📜 History":x==="members"?"👥 Members":"👑 Admin Panel"}</button>)}</nav>
 {tab==="dashboard"&&<main><div className="heroCard"><h2>Trip Fund</h2><div className="big">{money(rem)}</div><span>remaining from {money(fund)}</span><div className="bar"><i style={{width:`${Math.min(100,total/fund*100)}%`}}/></div></div><h2>Category Overview</h2><div className="cards">{cats.map(c=>{let v=expenses.filter(e=>e.category===c[1]).reduce((s,e)=>s+Number(e.amount),0);return <div className="card" key={c[1]}><span>{c[0]}</span><h3>{c[1]}</h3><b>{money(v)}</b><small>{money(v/n)} / person</small></div>})}</div></main>}
 {tab==="categories"&&<main><h2>Categories</h2><div className="cards">{cats.map(c=><div className="card" key={c[1]}><span>{c[0]}</span><h3>{c[1]}</h3><b>{money(expenses.filter(e=>e.category===c[1]).reduce((s,e)=>s+Number(e.amount),0))}</b></div>)}</div></main>}
 {tab==="history"&&<main><div className="top"><h2>Permanent Expense History</h2><div><button onClick={exportPDF}>📄 Save PDF</button><button onClick={exportExcel}>📊 Export Excel</button></div></div><div className="table"><table><thead><tr><th>#</th><th>Date & Time</th><th>Category</th><th>Expense</th><th>Amount</th><th>Per Person</th><th>Note</th></tr></thead><tbody>{expenses.map((e,i)=><tr key={e.id}><td>{i+1}</td><td>{new Date(e.created_at).toLocaleString()}</td><td>{e.category}</td><td>{e.name}</td><td>{money(e.amount)}</td><td>{money(Number(e.amount)/n)}</td><td>{e.note||"—"}</td></tr>)}</tbody></table></div><div className="final"><b>Total Expense: {money(total)}</b><b>Group Remaining Balance: {money(rem)}</b><b>Remaining Balance / Person: {money(ppr)}</b></div></main>}
 {tab==="members"&&<main><h2>Trip Members</h2><div className="cards">{members.map(m=><div className="card" key={m.id}><small>MEMBER {m.position}</small><h3>{m.name}</h3></div>)}</div></main>}
 {tab==="admin"&&mode==="admin"&&<main><h2>Admin Panel</h2><div className="adminGrid"><button onClick={addExpense}>＋ Add Expense</button><button onClick={()=>{const v=Number(prompt("Total Funding",String(fund)));if(v>=0)sb?.from("settings").upsert({key:"funding",value:String(v)}).then(load)}}>💰 Update Funding</button></div><h3>Member Names & Login</h3><p className="muted">Members do not need email. Default usernames are <b>member2</b>–<b>member7</b>, PIN <b>1234</b>. Change them below before sharing the link.</p>{members.map(m=>{const cr=credentials.find(x=>x.member_id===m.id);return <div className="memberAdmin" key={m.id}><div><small>MEMBER {m.position}</small><input className="memberInput" defaultValue={m.name} onBlur={e=>saveMember(m,e.currentTarget.value)}/></div><div><small>Username</small><input className="memberInput" defaultValue={cr?.username||`member${m.position}`} onBlur={e=>saveCredential(m.id,e.currentTarget.value,"")}/></div><div><small>New PIN</small><input className="memberInput" placeholder="Leave blank to keep" type="password" onBlur={e=>{const v=e.currentTarget.value;if(v)saveCredential(m.id,cr?.username||`member${m.position}`,v)}}/></div></div>})}</main>}
 <button className="fab" onClick={mode==="admin"?addExpense:()=>alert("View only mode")}>＋</button></div>
}

function Login(p:any){const [kind,setKind]=useState<"admin"|"member">("member");return <div className="login"><div className="loginBox"><div className="logo">🌿</div><h1>Sylhet Tour</h1><p>Money Manager</p><div className="loginTabs"><button className={kind==="member"?"active":""} onClick={()=>setKind("member")}>👤 Member</button><button className={kind==="admin"?"active":""} onClick={()=>setKind("admin")}>👑 Admin</button></div>{kind==="member"?<form onSubmit={p.submitMember}><input placeholder="Username" value={p.memberLogin.username} onChange={(e:any)=>p.setMemberLogin({...p.memberLogin,username:e.target.value})}/><input type="password" inputMode="numeric" placeholder="PIN" value={p.memberLogin.pin} onChange={(e:any)=>p.setMemberLogin({...p.memberLogin,pin:e.target.value})}/><button className="primary">{p.loading?"Signing in…":"Member Sign In"}</button></form>:<form onSubmit={p.submitAdmin}><input type="email" placeholder="Admin email" value={p.login.email} onChange={(e:any)=>p.setLogin({...p.login,email:e.target.value})}/><input type="password" placeholder="Password" value={p.login.password} onChange={(e:any)=>p.setLogin({...p.login,password:e.target.value})}/><button className="primary">{p.loading?"Signing in…":"Admin Sign In"}</button></form>}<small>{kind==="member"?"Members use username + PIN. No email is required.":"Admin uses the secure Supabase email/password account."}</small></div></div>}
function Setup(){return <div className="login"><div className="loginBox"><div className="logo">⚙️</div><h1>Almost ready</h1><p>Add your Supabase project keys to the Vercel environment variables:</p><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_PUBLISHABLE_KEY</code><p>Then deploy this project to Vercel.</p></div></div>}
createRoot(document.getElementById("root")!).render(<App/>);
