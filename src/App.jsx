import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCHSN1N7YqdTPXiZgFBMSvpRPV3UbPggkM",
  authDomain: "burbupack-40f95.firebaseapp.com",
  projectId: "burbupack-40f95",
  storageBucket: "burbupack-40f95.firebasestorage.app",
  messagingSenderId: "94928088605",
  appId: "1:94928088605:web:86c666a6f6c766e3d3a0f4"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const RANGOS = [
  { min:0,  max:2,        label:"1 a 2 mil" },
  { min:2,  max:4,        label:"2 a 4 mil" },
  { min:4,  max:7,        label:"4 a 7 mil" },
  { min:7,  max:10,       label:"7 a 10 mil" },
  { min:10, max:Infinity, label:"Más de 10 mil" },
];
const BURBUJAS = [
  { value:"Standard",     label:"Standard" },
  { value:"Microburbuja", label:"Microburbuja" },
  { value:"Burbujón",     label:"Burbujón" },
];
const METROS_REP = 1000, METROS_INV = 500;
const B = "#0099d8", BD = "#005f8a", BG = "#e6f6fd", BDK = "#003d5c";

const INIT = {
  adminPin: "0000",
  vendedores: [
    { id:1, nombre:"Vendedor 1", pin:"1111" },
    { id:2, nombre:"Vendedor 2", pin:"2222" },
    { id:3, nombre:"Vendedor 3", pin:"3333" },
    { id:4, nombre:"Vendedor 4", pin:"4444" },
    { id:5, nombre:"Vendedor 5", pin:"5555" },
    { id:6, nombre:"Vendedor 6", pin:"6666" },
    { id:7, nombre:"Vendedor 7", pin:"7777" },
  ],
  precioPE: 1.20,
  costoRolloRepegable: 0,
  costoRolloInviolable: 0,
  costoCalibacion: 100,
  minimoUSD: 300,
  rentabilidades: [6.0, 4.0, 3.0, 2.5, 2.0],
  tipoCambio: 1405,
  cotizaciones: [],
};

const ceil   = n => Math.ceil(n);
const fmt    = n => new Intl.NumberFormat("es-AR").format(ceil(n));
const fmtDec = (n, d=2) => new Intl.NumberFormat("es-AR", { minimumFractionDigits:d, maximumFractionDigits:d }).format(n);
const today  = () => new Date().toLocaleDateString("es-AR");

function getRangoIdx(m) {
  if (m <= 2)  return 0;
  if (m <= 4)  return 1;
  if (m <= 7)  return 2;
  if (m <= 10) return 3;
  return 4;
}

function calcular(inp, adm) {
  const { tipo, burbuja, capas, ancho, largo, solapa, millares, cintaRep, cintaInv, color } = inp;
  const anchoMaquina = burbuja === "Standard" ? 192 : 144;
  const anchoNum  = parseFloat(ancho)  || 0;
  const largoNum  = parseFloat(largo)  || 0;
  const solapaNum = parseFloat(solapa) || 0;
  const anchoReqRaw = tipo === "bolsa" ? largoNum * 2 + solapaNum : anchoNum;
  if (anchoReqRaw <= 0) return null;
  const anchoReq = Math.ceil(anchoReqRaw / 10) * 10;
  const fajas = Math.floor(anchoMaquina / anchoReq);
  if (fajas <= 0) return { anchoReq, anchoMaquina, fajas:0, error:true };
  const desperdicioCm = Math.round(anchoMaquina - fajas * anchoReq);
  const pctDesp = Math.round((desperdicioCm / anchoMaquina) * 100);

  const cantMillares = parseFloat(millares) || 0;
  const cantUnidades = Math.round(cantMillares * 1000);

  const PESO_M2 = { Standard:0.0777, Microburbuja:0.092, Burbujón:0.092 };
  const factorTipo  = tipo === "lamina" ? 0.5 : 1;
  const factorCapas = capas === "triple" ? 1.5 : 1;
  const factorColor = color ? 1.25 : 1;
  const costoM2ars  = (PESO_M2[burbuja]||0.0777) * adm.precioPE * adm.tipoCambio * factorTipo * factorCapas * factorColor;
  const m2Unidad    = (anchoNum / 100) * (largoNum / 100);
  const costoMaterial = costoM2ars * m2Unidad;

  const costoCmRep = adm.costoRolloRepegable  > 0 ? ((adm.costoRolloRepegable  * adm.tipoCambio) / (METROS_REP * 100)) * 3 : 0;
  const costoCmInv = adm.costoRolloInviolable > 0 ? ((adm.costoRolloInviolable * adm.tipoCambio) / (METROS_INV * 100)) * 3 : 0;
  let extras = 0;
  if (cintaRep) extras += costoCmRep * anchoNum;
  if (cintaInv) extras += costoCmInv * anchoNum;

  const costoPorUnidad = costoMaterial + extras;
  const rangoIdx    = getRangoIdx(cantMillares);
  const rentaMult   = 1 + (adm.rentabilidades[rangoIdx] || 2);
  const precioBase  = costoPorUnidad * rentaMult;

  // Calibración: se suma DESPUÉS de rentabilidad si total < mínimo USD
  const totalBaseUSD = cantUnidades > 0 ? (precioBase * cantUnidades) / adm.tipoCambio : 0;
  const aplicaCalib  = cantUnidades > 0 && totalBaseUSD < (adm.minimoUSD || 300);
  const calibPorUnidad = aplicaCalib ? ((adm.costoCalibacion || 100) * adm.tipoCambio) / cantUnidades : 0;

  const precioPorUnidad = precioBase + calibPorUnidad;
  const precioTotal     = precioPorUnidad * cantUnidades;
  const costoTotal      = costoPorUnidad  * cantUnidades;
  const utilidad        = precioTotal - costoTotal;

  return {
    anchoReq, anchoMaquina, fajas, desperdicioCm, pctDesp,
    costoPorUnidad, precioPorUnidad,
    precioPorUnidadUSD:  precioPorUnidad / adm.tipoCambio,
    precioPorMillar:     precioPorUnidad * 1000,
    precioPorMillarUSD: (precioPorUnidad * 1000) / adm.tipoCambio,
    precioTotal,  precioTotalUSD:  precioTotal / adm.tipoCambio,
    costoTotal,   costoTotalUSD:   costoTotal  / adm.tipoCambio,
    utilidad,     utilidadUSD:     utilidad    / adm.tipoCambio,
    rentReal: costoTotal > 0 ? Math.round((utilidad / costoTotal) * 100) : 0,
    rangoLabel: RANGOS[rangoIdx].label,
    rentaPct:   Math.round(adm.rentabilidades[rangoIdx] * 100),
    cantUnidades, cantMillares, error:false,
  };
}

const BurbuLogo  = () => <img src="/burbupack.png"  alt="BurbuPack" style={{ height:44, display:"block" }}/>;
const EmpackLogo = () => <img src="/empack.png" alt="Empack" style={{ height:32, display:"block" }}/>;

export default function App() {
  const [as, setAsRaw] = useState(INIT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, "config", "global");
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) setAsRaw({ ...INIT, ...snap.data() });
      else setDoc(ref, INIT);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const setAs = fn => {
    setAsRaw(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      setDoc(doc(db, "config", "global"), next);
      return next;
    });
  };

  const [screen,        setScreen]        = useState("login");
  const [role,          setRole]          = useState(null);
  const [vidId,         setVidId]         = useState(null);
  const [pinInput,      setPinInput]      = useState("");
  const [loginStep,     setLoginStep]     = useState("select");
  const [pinError,      setPinError]      = useState("");
  const [tab,           setTab]           = useState("cotizador");
  const [adminTab,      setAdminTab]      = useState("costos");
  const [filterV,       setFilterV]       = useState("todos");
  const [clienteNombre, setClienteNombre] = useState("");
  const [savedMsg,      setSavedMsg]      = useState("");
  const [dolarLoading,  setDolarLoading]  = useState(false);
  const [inp, setInp] = useState({ tipo:"bolsa", burbuja:"Standard", capas:"simple", ancho:"", largo:"", solapa:"", millares:"", cintaRep:false, cintaInv:false, color:false });
  const [res, setRes] = useState(null);

  const setI = (k,v) => setInp(p => ({ ...p, [k]:v }));

  useEffect(() => { setRes(calcular(inp, as)); }, [inp, as.precioPE, as.costoRolloRepegable, as.costoRolloInviolable, as.rentabilidades, as.tipoCambio, as.minimoUSD, as.costoCalibacion]);

  async function fetchDolar() {
    setDolarLoading(true);
    try {
      const r = await fetch("https://api.bluelytics.com.ar/v2/latest");
      const d = await r.json();
      if (d?.oficial?.value_sell) setAs(p => ({ ...p, tipoCambio:d.oficial.value_sell }));
    } catch {}
    setDolarLoading(false);
  }

  useEffect(() => { if (screen === "app") fetchDolar(); }, [screen]);

  function handleLogin() {
    if (role === "admin") {
      if (pinInput === as.adminPin) { setScreen("app"); setPinInput(""); setPinError(""); }
      else { setPinError("PIN incorrecto"); setPinInput(""); }
    } else {
      const v = as.vendedores.find(x => x.id === vidId);
      if (v && pinInput === v.pin) { setScreen("app"); setPinInput(""); setPinError(""); }
      else { setPinError("PIN incorrecto"); setPinInput(""); }
    }
  }

  function guardar() {
    if (!clienteNombre.trim() || !res || res.error || !res.cantMillares) return;
    const vendedor = role === "admin" ? "Admin" : as.vendedores.find(v => v.id === vidId)?.nombre || "?";
    setAs(p => ({ ...p, cotizaciones:[{ id:Date.now(), fecha:today(), cliente:clienteNombre.trim(), vendedor, inp:{...inp}, res:{...res}, tc:as.tipoCambio }, ...p.cotizaciones] }));
    setSavedMsg("¡Guardado!"); setClienteNombre("");
    setTimeout(() => setSavedMsg(""), 2500);
  }

  function whatsapp() {
    if (!res || res.error) return;
    const vend = role === "admin" ? "BurbuPack" : as.vendedores.find(x => x.id === vidId)?.nombre || "";
    const tipo = inp.tipo === "bolsa" ? "Bolsa" : "Lámina";
    const med  = inp.tipo === "bolsa" ? `${inp.ancho}×${inp.largo} cm | Solapa: ${inp.solapa} cm` : `${inp.ancho}×${inp.largo} cm`;
    const msg  = `*Cotización BurbuPack* — ${vend}\n📅 ${today()}${clienteNombre ? `\n👤 ${clienteNombre}` : ""}\n\n*Producto:* ${tipo} ${inp.burbuja} ${inp.capas}\n*Medidas:* ${med}\n*Cantidad:* ${res.cantMillares} mil u. (${res.cantUnidades.toLocaleString("es-AR")})\n\n💲 *Por millar:*\nU$S ${fmtDec(res.precioPorMillarUSD,2)}.-\n$ ${fmt(res.precioPorMillar)}.-\n\n✅ *TOTAL:*\nU$S ${fmt(res.precioTotalUSD)}.- + IVA\n$ ${fmt(res.precioTotal)}.- + IVA\n\n_TC: $${fmt(as.tipoCambio)} ARS/USD_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  }

  function pdf() {
    if (!res || res.error) return;
    const vend  = role === "admin" ? "Administrador" : as.vendedores.find(v => v.id === vidId)?.nombre || "";
    const tipo  = inp.tipo === "bolsa" ? "Bolsa" : "Lámina";
    const med   = inp.tipo === "bolsa" ? `Ancho: ${inp.ancho} cm | Largo: ${inp.largo} cm | Solapa: ${inp.solapa} cm` : `Ancho: ${inp.ancho} cm | Largo: ${inp.largo} cm`;
    const extras = [inp.cintaRep && "Cinta repegable", inp.cintaInv && "Cinta inviolable", inp.color && "Color"].filter(Boolean).join(", ") || "Ninguno";
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cotización BurbuPack</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:36px;color:#1a1a1a;font-size:14px}
.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:18px;margin-bottom:24px;border-bottom:3px solid #0099d8}
.burbu{font-size:30px;font-weight:900;color:#0099d8}.burbu span{color:#444;font-weight:400}
.em{font-size:18px;font-weight:700;color:#0099d8;text-align:right}.em small{font-size:11px;color:#999;display:block;letter-spacing:2px}
table{width:100%;border-collapse:collapse;margin:14px 0}
th{background:#e6f6fd;color:#005f8a;text-align:left;padding:9px 14px;font-size:12px;font-weight:700;border-bottom:2px solid #0099d8}
td{padding:8px 14px;font-size:13px;border-bottom:1px solid #f0f0f0}
.price-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}
.pbox{border:1.5px solid #0099d8;border-radius:10px;padding:12px 14px}
.pbox .lbl{font-size:11px;color:#005f8a;font-weight:700;margin-bottom:6px}
.pbox .usd{font-size:20px;font-weight:700;color:#000}
.pbox .ars{font-size:14px;color:#0099d8;margin-top:2px}
.total{background:linear-gradient(135deg,#0099d8,#005f8a);color:white;border-radius:12px;padding:22px 24px;margin-top:16px}
.total .lbl{font-size:12px;opacity:.75;margin-bottom:6px}
.total .usd{font-size:28px;font-weight:700}
.total .ars{font-size:18px;opacity:.9;margin-top:4px}
.footer{margin-top:28px;font-size:11px;color:#aaa;text-align:center;border-top:1px solid #eee;padding-top:12px}
</style></head><body>
<div class="header">
  <div><div class="burbu">Burbu<span>pack</span><sup style="font-size:10px">®</sup></div></div>
  <div class="em">empack<sup style="font-size:9px">®</sup><small>inc.</small></div>
</div>
<p style="font-size:13px;color:#666;margin-bottom:16px">📅 ${today()} &nbsp;|&nbsp; Vendedor: <b>${vend}</b>${clienteNombre ? ` &nbsp;|&nbsp; Cliente: <b>${clienteNombre}</b>` : ""}</p>
<table><tr><th colspan="2">DETALLE DEL PRODUCTO</th></tr>
<tr><td>Tipo</td><td><b>${tipo} ${inp.burbuja} — ${inp.capas}</b></td></tr>
<tr><td>Medidas</td><td>${med}</td></tr>
<tr><td>Cantidad</td><td>${res.cantMillares} millares (${res.cantUnidades.toLocaleString("es-AR")} unidades)</td></tr>
<tr><td>Extras</td><td>${extras}</td></tr>
</table>
<div class="price-grid">
<div class="pbox"><div class="lbl">POR UNIDAD</div><div class="usd">U$S ${fmtDec(res.precioPorUnidadUSD,2)}</div><div class="ars">$ ${fmtDec(res.precioPorUnidad,2)}</div></div>
<div class="pbox"><div class="lbl">POR MILLAR</div><div class="usd">U$S ${fmtDec(res.precioPorMillarUSD,2)}.-</div><div class="ars">$ ${fmt(res.precioPorMillar)}.-</div></div>
</div>
<div class="total">
<div class="lbl">TOTAL — ${res.cantMillares} mil (${res.cantUnidades.toLocaleString("es-AR")} u.)</div>
<div class="usd">U$S ${fmt(res.precioTotalUSD)}.- <span style="font-size:14px;font-weight:400">+ IVA</span></div>
<div class="ars">$ ${fmt(res.precioTotal)}.- <span style="font-size:13px;font-weight:400">+ IVA</span></div>
<div style="font-size:11px;opacity:.6;margin-top:8px">Tipo de cambio: $${fmt(as.tipoCambio)} ARS/USD</div>
</div>
<div class="footer">Cotización generada por sistema BurbuPack / Empack Inc. — ${today()}</div>
</body></html>`;
    const w = window.open("", "_blank"); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500);
  }

  const iS   = { width:"100%", boxSizing:"border-box", padding:"8px 12px", fontSize:15, borderRadius:8, border:`0.5px solid ${B}40`, background:"var(--color-background-primary)", color:"var(--color-text-primary)" };
  const lS   = { fontSize:12, color:BD, marginBottom:4, display:"block", fontWeight:500, letterSpacing:0.3 };
  const crd  = { background:"var(--color-background-primary)", border:`0.5px solid ${B}30`, borderRadius:14, padding:14, marginBottom:12, boxShadow:`0 1px 4px rgba(0,153,216,0.07)` };
  const mC   = { background:BG, borderRadius:10, padding:"10px 12px", flex:1, minWidth:0, border:`0.5px solid ${B}25` };
  const tBtn   = act => ({ flex:1, padding:"9px 0", fontSize:13, borderRadius:9, cursor:"pointer", background:act?B:"transparent", color:act?"white":BD, border:`0.5px solid ${act?B:B+"50"}`, fontWeight:act?600:400 });
  const togBtn = act => ({ flex:1, padding:"8px 0", fontSize:13, borderRadius:8, cursor:"pointer", background:act?`${B}18`:"transparent", color:act?BDK:"var(--color-text-secondary)", border:`0.5px solid ${act?B:"var(--color-border-tertiary)"}`, fontWeight:act?600:400 });

  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:300, gap:16 }}>
      <BurbuLogo/><p style={{ color:BD, fontSize:14 }}>Cargando...</p>
    </div>
  );

  if (screen === "login") return (
    <div style={{ fontFamily:"var(--font-sans)", minHeight:400, background:"var(--color-background-primary)" }}>
      <div style={{ background:"#000", padding:"28px 20px 20px", borderRadius:"0 0 24px 24px", marginBottom:20, textAlign:"center" }}>
        <BurbuLogo/>
        <div style={{ marginTop:10 }}><EmpackLogo/></div>
        <p style={{ color:"rgba(255,255,255,0.6)", fontSize:13, marginTop:10, fontWeight:600, letterSpacing:1 }}>BURBUPACK Bolsas COTIZADOR</p>
      </div>
      <div style={{ padding:"0 16px" }}>
        {loginStep === "select" && (
          <div style={crd}>
            <p style={{ ...lS, marginBottom:12, fontSize:14 }}>¿Quién sos?</p>
            <button onClick={() => { setRole("admin"); setLoginStep("pin"); }} style={{ ...iS, marginBottom:8, cursor:"pointer", textAlign:"left", background:`${B}12`, border:`0.5px solid ${B}`, color:BDK, fontWeight:500 }}>🔑 Gerente comercial (Admin)</button>
            {as.vendedores.map(v => (
              <button key={v.id} onClick={() => { setRole("vendedor"); setVidId(v.id); setLoginStep("pin"); }} style={{ ...iS, marginBottom:8, cursor:"pointer", textAlign:"left", background:"var(--color-background-secondary)" }}>👤 {v.nombre}</button>
            ))}
          </div>
        )}
        {loginStep === "pin" && (
          <div style={crd}>
            <p style={{ ...lS, marginBottom:12, fontSize:14 }}>PIN — {role === "admin" ? "Admin" : as.vendedores.find(v => v.id === vidId)?.nombre}</p>
            <input type="password" maxLength={6} value={pinInput} onChange={e => setPinInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} style={{ ...iS, fontSize:24, letterSpacing:8, textAlign:"center", marginBottom:8, border:`1.5px solid ${B}` }} placeholder="••••" autoFocus/>
            {pinError && <p style={{ color:"#c0392b", fontSize:13, margin:"0 0 8px" }}>{pinError}</p>}
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => { setLoginStep("select"); setPinInput(""); setPinError(""); }} style={{ ...iS, cursor:"pointer", flex:1, color:BD }}>← Volver</button>
              <button onClick={handleLogin} style={{ ...iS, cursor:"pointer", flex:2, background:B, color:"white", border:"none", fontWeight:600, fontSize:15 }}>Ingresar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const LIMITES = {
    bolsa:  { Standard:{anchoMin:10,anchoMax:500,largoMin:10,largoMax:90}, Microburbuja:{anchoMin:10,anchoMax:500,largoMin:10,largoMax:70}, Burbujón:{anchoMin:25,anchoMax:500,largoMin:25,largoMax:70} },
    lamina: { Standard:{anchoMin:10,anchoMax:190,largoMin:10,largoMax:500}, Microburbuja:{anchoMin:10,anchoMax:145,largoMin:10,largoMax:500}, Burbujón:{anchoMin:10,anchoMax:145,largoMin:10,largoMax:500} },
  };
  const lim    = LIMITES[inp.tipo][inp.burbuja];
  const anchoV = parseFloat(inp.ancho) || 0;
  const largoV = parseFloat(inp.largo) || 0;
  const medidaError = anchoV > 0 && (anchoV < lim.anchoMin || anchoV > lim.anchoMax)
    ? `Ancho debe ser entre ${lim.anchoMin} y ${lim.anchoMax} cm para ${inp.burbuja}.`
    : largoV > 0 && (largoV < lim.largoMin || largoV > lim.largoMax)
    ? `Largo debe ser entre ${lim.largoMin} y ${lim.largoMax} cm para ${inp.burbuja}.`
    : null;
  const usaCinta   = inp.cintaRep || inp.cintaInv;
  const solapaV    = parseFloat(inp.solapa) || 0;
  const solapaError = usaCinta && inp.tipo === "bolsa"
    ? solapaV < 4 ? "Con cinta, la solapa debe ser mínimo 4 cm."
    : largoV > 0 && solapaV > largoV * 0.5 ? `Con cinta, la solapa no puede superar el 50% del largo (máx. ${largoV * 0.5} cm).`
    : null : null;

  const misCot = role === "admin" ? as.cotizaciones : as.cotizaciones.filter(c => c.vendedor === as.vendedores.find(v => v.id === vidId)?.nombre);

  return (
    <div style={{ fontFamily:"var(--font-sans)", background:"var(--color-background-primary)", minHeight:400 }}>
      <div style={{ background:"#000", padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <BurbuLogo/>
        <div style={{ textAlign:"right" }}>
          <div style={{ color:"rgba(255,255,255,0.9)", fontSize:12, fontWeight:500 }}>{role === "admin" ? "Admin" : as.vendedores.find(v => v.id === vidId)?.nombre}</div>
          <button onClick={() => { setScreen("login"); setLoginStep("select"); setPinInput(""); setRole(null); }} style={{ fontSize:11, color:"rgba(255,255,255,0.5)", background:"none", border:"none", cursor:"pointer", padding:0 }}>Salir</button>
        </div>
      </div>

      <div style={{ padding:"0 14px" }}>
        <div style={{ display:"flex", gap:6, marginBottom:14 }}>
          {["cotizador","historial",...(role==="admin"?["admin"]:[])].map(t => (
            <button key={t} onClick={() => setTab(t)} style={tBtn(tab===t)}>{t==="cotizador"?"Cotizar":t==="historial"?"Cotizaciones":"Admin"}</button>
          ))}
        </div>

        {tab === "cotizador" && (<>
          <div style={crd}>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              {["bolsa","lamina"].map(t => <button key={t} onClick={() => setI("tipo",t)} style={togBtn(inp.tipo===t)}>{t==="bolsa"?"Bolsa":"Lámina"}</button>)}
            </div>
            <label style={lS}>Tipo de burbuja</label>
            <div style={{ display:"flex", gap:8, marginBottom:10 }}>
              {BURBUJAS.map(b => <button key={b.value} onClick={() => setI("burbuja",b.value)} style={{ ...togBtn(inp.burbuja===b.value), flex:1, fontSize:12, padding:"8px 4px" }}>{b.label}</button>)}
            </div>
            <label style={lS}>Capas</label>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              {["simple","triple"].map(c => <button key={c} onClick={() => setI("capas",c)} style={togBtn(inp.capas===c)}>{c==="simple"?"Simple":"Triple"}</button>)}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
              <div><label style={lS}>Ancho (cm)</label><input type="number" value={inp.ancho} onChange={e => setI("ancho",e.target.value)} style={iS} placeholder="0"/></div>
              <div><label style={lS}>Largo (cm)</label><input type="number" value={inp.largo} onChange={e => setI("largo",e.target.value)} style={iS} placeholder="0"/></div>
              {inp.tipo==="bolsa" && <div><label style={lS}>Solapa (cm)</label><input type="number" value={inp.solapa} onChange={e => setI("solapa",e.target.value)} style={iS} placeholder="0"/></div>}
              <div><label style={lS}>Cantidad (millares)</label><input type="number" step="0.5" value={inp.millares} onChange={e => setI("millares",e.target.value)} style={iS} placeholder="ej: 2.5"/></div>
            </div>
            <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
              {[["cintaRep","Cinta repegable"],["cintaInv","Cinta inviolable"],["color","Color"]].map(([k,lbl]) => (
                <label key={k} style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, color:BD, cursor:"pointer", fontWeight:500 }}>
                  <input type="checkbox" checked={inp[k]} onChange={e => setI(k,e.target.checked)}/>{lbl}
                </label>
              ))}
            </div>
          </div>

          {medidaError && <div style={{ background:"#fdf2f2", border:`0.5px solid #e74c3c`, borderRadius:10, padding:"10px 14px", marginBottom:12 }}><p style={{ color:"#c0392b", fontSize:13, margin:0, fontWeight:500 }}>⚠️ {medidaError}</p></div>}
          {solapaError && <div style={{ background:"#fff8e1", border:`0.5px solid #f39c12`, borderRadius:10, padding:"10px 14px", marginBottom:12 }}><p style={{ color:"#b7770d", fontSize:13, margin:0, fontWeight:500 }}>⚠️ {solapaError}</p></div>}

          {res && !res.error && res.cantMillares > 0 && !solapaError && !medidaError && (<>
            {role === "admin" && (
              <div style={{ ...crd, background:BG, border:`0.5px solid ${B}40` }}>
                <p style={{ fontSize:11, color:BD, margin:"0 0 10px", fontWeight:700, letterSpacing:0.8 }}>FABRICACIÓN</p>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {[["Ancho Jumbo Requerido",res.anchoReq+" cm"],["Ancho útil máquina",res.anchoMaquina+" cm"],["Rollos Jumbo por bajada",res.fajas],["Desperdicio",res.desperdicioCm+" cm ("+res.pctDesp+"%)"]].map(([k,v]) => (
                    <div key={k}><p style={{ fontSize:11, color:BD, margin:"0 0 2px" }}>{k}</p><p style={{ fontSize:15, fontWeight:600, margin:0, color:BDK }}>{v}</p></div>
                  ))}
                </div>
              </div>
            )}

            <div style={crd}>
              <p style={{ fontSize:11, color:BD, margin:"0 0 10px", fontWeight:700, letterSpacing:0.8 }}>PRECIO</p>
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <div style={mC}>
                  <p style={{ fontSize:11, color:BD, margin:"0 0 3px", fontWeight:600 }}>Por unidad</p>
                  <p style={{ fontSize:17, fontWeight:700, margin:"0 0 1px", color:"#000" }}>U$S {fmtDec(res.precioPorUnidadUSD,2)}</p>
                  <p style={{ fontSize:14, color:B, margin:0, fontWeight:600 }}>${fmtDec(res.precioPorUnidad,2)}</p>
                </div>
                <div style={mC}>
                  <p style={{ fontSize:11, color:BD, margin:"0 0 3px", fontWeight:600 }}>Por millar</p>
                  <p style={{ fontSize:17, fontWeight:700, margin:"0 0 1px", color:"#000" }}>U$S {fmtDec(res.precioPorMillarUSD,2)}.-</p>
                  <p style={{ fontSize:14, color:B, margin:0, fontWeight:600 }}>${fmt(res.precioPorMillar)}.-</p>
                </div>
              </div>

              <div style={{ background:`linear-gradient(135deg,${B},${BD})`, borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
                <p style={{ fontSize:11, color:"rgba(255,255,255,0.75)", margin:"0 0 4px" }}>Total — {res.cantMillares} mil ({res.cantUnidades.toLocaleString("es-AR")} u.)</p>
                <p style={{ fontSize:26, fontWeight:700, margin:"0 0 2px", color:"white" }}>U$S {fmt(res.precioTotalUSD)}.- <span style={{ fontSize:15, fontWeight:400 }}>+ IVA</span></p>
                <p style={{ fontSize:18, fontWeight:600, color:"rgba(255,255,255,0.9)", margin:0 }}>$ {fmt(res.precioTotal)}.- <span style={{ fontSize:12, fontWeight:400, opacity:0.8 }}>+ IVA</span></p>
                <p style={{ fontSize:11, color:"rgba(255,255,255,0.55)", margin:"6px 0 0" }}>TC: ${fmt(as.tipoCambio)} ARS/USD</p>
              </div>

              {role === "admin" && (
                <div style={{ background:"#1a1a2e", borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
                  <p style={{ fontSize:11, color:"rgba(255,255,255,0.6)", margin:"0 0 10px", fontWeight:700, letterSpacing:0.8 }}>RENTABILIDAD DEL PEDIDO</p>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                    <div><p style={{ fontSize:11, color:"rgba(255,255,255,0.5)", margin:"0 0 3px" }}>Costo Total</p><p style={{ fontSize:13, fontWeight:700, color:"white", margin:"0 0 2px" }}>${fmt(res.costoTotal)}</p><p style={{ fontSize:11, color:"#7ecbf5", margin:0 }}>U$S {fmt(res.costoTotalUSD)}</p></div>
                    <div><p style={{ fontSize:11, color:"rgba(255,255,255,0.5)", margin:"0 0 3px" }}>Utilidad</p><p style={{ fontSize:13, fontWeight:700, color:"#4cd964", margin:"0 0 2px" }}>${fmt(res.utilidad)}</p><p style={{ fontSize:11, color:"#7ecbf5", margin:0 }}>U$S {fmt(res.utilidadUSD)}</p></div>
                    <div><p style={{ fontSize:11, color:"rgba(255,255,255,0.5)", margin:"0 0 3px" }}>Rentabilidad</p><p style={{ fontSize:22, fontWeight:700, color:"#4cd964", margin:0 }}>{res.rentReal}%</p></div>
                  </div>
                </div>
              )}

              <label style={lS}>Cliente (para guardar)</label>
              <input value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} style={{ ...iS, marginBottom:8 }} placeholder="Nombre del cliente"/>
              {savedMsg && <p style={{ color:"#27ae60", fontSize:13, margin:"0 0 8px", fontWeight:500 }}>{savedMsg}</p>}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                <button onClick={guardar}  style={{ padding:"10px 4px", fontSize:12, borderRadius:9, border:`0.5px solid ${B}`, background:BG, cursor:"pointer", color:BD, fontWeight:600 }}>💾 Guardar</button>
                <button onClick={whatsapp} style={{ padding:"10px 4px", fontSize:12, borderRadius:9, border:"none", background:"#25D366", cursor:"pointer", color:"white", fontWeight:600 }}>📲 WhatsApp</button>
                <button onClick={pdf}      style={{ padding:"10px 4px", fontSize:12, borderRadius:9, border:`0.5px solid ${B}`, background:BG, cursor:"pointer", color:BD, fontWeight:600 }}>🖨 PDF</button>
              </div>
            </div>
          </>)}

          {res && res.error && (
            <div style={{ ...crd, border:"0.5px solid #e74c3c", background:"#fdf2f2" }}>
              <p style={{ color:"#c0392b", margin:0, fontSize:14 }}>El ancho requerido ({res.anchoReq} cm) supera el ancho útil de la máquina {inp.burbuja} ({res.anchoMaquina} cm).</p>
            </div>
          )}
        </>)}

        {tab === "historial" && (
          <div>
            {role === "admin" && (
              <div style={{ marginBottom:12 }}>
                <label style={lS}>Filtrar por vendedor</label>
                <select value={filterV} onChange={e => setFilterV(e.target.value)} style={iS}>
                  <option value="todos">Todos</option>
                  <option value="Admin">Admin</option>
                  {as.vendedores.map(v => <option key={v.id} value={v.nombre}>{v.nombre}</option>)}
                </select>
              </div>
            )}
            {(filterV==="todos"?misCot:misCot.filter(c=>c.vendedor===filterV)).length===0
              ? <p style={{ color:"var(--color-text-secondary)", fontSize:14 }}>Sin cotizaciones guardadas.</p>
              : (filterV==="todos"?misCot:misCot.filter(c=>c.vendedor===filterV)).map(c => (
                <div key={c.id} style={crd}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontWeight:600, fontSize:15, color:BDK }}>{c.cliente}</span>
                    <span style={{ fontSize:12, color:"var(--color-text-secondary)" }}>{c.fecha}</span>
                  </div>
                  {role==="admin" && <p style={{ fontSize:12, color:BD, margin:"0 0 4px" }}>{c.vendedor}</p>}
                  <p style={{ fontSize:13, color:"var(--color-text-secondary)", margin:"0 0 8px" }}>{c.inp.tipo==="bolsa"?"Bolsa":"Lámina"} {c.inp.burbuja} {c.inp.capas} · {c.res.cantMillares} mil u.</p>
                  <div style={{ display:"flex", gap:8 }}>
                    <div style={mC}><p style={{ fontSize:11, color:BD, margin:"0 0 2px", fontWeight:600 }}>USD</p><p style={{ fontSize:15, fontWeight:700, margin:0, color:BDK }}>U$S {fmt(c.res.precioTotalUSD)}</p></div>
                    <div style={mC}><p style={{ fontSize:11, color:BD, margin:"0 0 2px", fontWeight:600 }}>ARS</p><p style={{ fontSize:15, fontWeight:700, margin:0, color:BDK }}>${fmt(c.res.precioTotal)}</p></div>
                  </div>
                </div>
              ))}
          </div>
        )}

        {tab === "admin" && role === "admin" && (<>
          <div style={{ display:"flex", gap:6, marginBottom:14 }}>
            {["costos","vendedores","pines"].map(t => (
              <button key={t} onClick={() => setAdminTab(t)} style={tBtn(adminTab===t)}>{t==="costos"?"Costos":t==="vendedores"?"Vendedores":"PINs"}</button>
            ))}
          </div>

          {adminTab === "costos" && (<>
            <div style={crd}>
              <p style={{ fontSize:11, fontWeight:700, color:BD, margin:"0 0 10px", letterSpacing:0.8 }}>TIPO DE CAMBIO</p>
              <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
                <div style={{ flex:1 }}><label style={lS}>$ ARS por USD</label><input type="number" value={as.tipoCambio} onChange={e => setAs(p => ({...p,tipoCambio:parseFloat(e.target.value)||0}))} style={iS}/></div>
                <button onClick={fetchDolar} style={{ padding:"9px 12px", fontSize:13, borderRadius:8, border:`1px solid ${B}`, background:B, color:"white", cursor:"pointer", fontWeight:600, whiteSpace:"nowrap" }}>{dolarLoading?"...":"🔄 Actualizar"}</button>
              </div>
              <p style={{ fontSize:11, color:BD, margin:"6px 0 0" }}>Dólar billete vendedor — Banco Nación</p>
            </div>

            <div style={crd}>
              <p style={{ fontSize:11, fontWeight:700, color:BD, margin:"0 0 10px", letterSpacing:0.8 }}>PRECIO POLIETILENO (USD/kg)</p>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:14, color:BD, fontWeight:600 }}>U$S</span>
                <input type="number" step="0.01" value={as.precioPE} onChange={e => setAs(p => ({...p,precioPE:parseFloat(e.target.value)||0}))} style={{ ...iS, flex:1 }}/>
              </div>
              <div style={{ marginTop:10, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                {[["Standard","0.0777"],["Microburbuja","0.092"],["Burbujón","0.092"]].map(([b,kg]) => (
                  <div key={b} style={{ background:BG, borderRadius:8, padding:"8px 10px", border:`0.5px solid ${B}25` }}>
                    <p style={{ fontSize:11, color:BD, margin:"0 0 2px", fontWeight:600 }}>{b}</p>
                    <p style={{ fontSize:12, color:BDK, margin:0 }}>{kg} kg/m²</p>
                    <p style={{ fontSize:12, color:B, margin:0, fontWeight:600 }}>U$S {((parseFloat(kg)||0)*as.precioPE).toFixed(4)}/m²</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={crd}>
              <p style={{ fontSize:11, fontWeight:700, color:BD, margin:"0 0 10px", letterSpacing:0.8 }}>COSTO ROLLOS DE CINTA (USD)</p>
              <div style={{ marginBottom:12 }}>
                <label style={lS}>Cinta repegable (rollo 1.000 mts)</label>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:14, color:BD, fontWeight:600 }}>U$S</span>
                  <input type="number" step="0.01" value={as.costoRolloRepegable} onChange={e => setAs(p => ({...p,costoRolloRepegable:parseFloat(e.target.value)||0}))} style={{ ...iS, flex:1 }}/>
                </div>
                {as.costoRolloRepegable > 0 && <p style={{ fontSize:11, color:B, margin:"4px 0 0" }}>→ U$S {(as.costoRolloRepegable/(METROS_REP*100)*3).toFixed(6)} por cm lineal</p>}
              </div>
              <div>
                <label style={lS}>Cinta inviolable (rollo 500 mts)</label>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:14, color:BD, fontWeight:600 }}>U$S</span>
                  <input type="number" step="0.01" value={as.costoRolloInviolable} onChange={e => setAs(p => ({...p,costoRolloInviolable:parseFloat(e.target.value)||0}))} style={{ ...iS, flex:1 }}/>
                </div>
                {as.costoRolloInviolable > 0 && <p style={{ fontSize:11, color:B, margin:"4px 0 0" }}>→ U$S {(as.costoRolloInviolable/(METROS_INV*100)*3).toFixed(6)} por cm lineal</p>}
              </div>
            </div>

            <div style={crd}>
              <p style={{ fontSize:11, fontWeight:700, color:BD, margin:"0 0 10px", letterSpacing:0.8 }}>MÍNIMO DE FACTURACIÓN</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <div>
                  <label style={lS}>Mínimo pedido (USD)</label>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:14, color:BD, fontWeight:600 }}>U$S</span>
                    <input type="number" step="10" value={as.minimoUSD||300} onChange={e => setAs(p => ({...p,minimoUSD:parseFloat(e.target.value)||0}))} style={{ ...iS, flex:1 }}/>
                  </div>
                </div>
                <div>
                  <label style={lS}>Costo calibración (USD)</label>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:14, color:BD, fontWeight:600 }}>U$S</span>
                    <input type="number" step="10" value={as.costoCalibacion||100} onChange={e => setAs(p => ({...p,costoCalibacion:parseFloat(e.target.value)||0}))} style={{ ...iS, flex:1 }}/>
                  </div>
                </div>
              </div>
              <p style={{ fontSize:11, color:BD, margin:"8px 0 0" }}>Si el total es menor al mínimo, se prorratea el costo de calibración entre las unidades.</p>
            </div>

            <div style={crd}>
              <p style={{ fontSize:11, fontWeight:700, color:BD, margin:"0 0 10px", letterSpacing:0.8 }}>RENTABILIDAD POR RANGO (millares)</p>
              {RANGOS.map((r,i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:13, color:BD, flex:1 }}>{r.label}</span>
                  <input type="number" value={Math.round(as.rentabilidades[i]*100)} onChange={e => setAs(p => { const r2=[...p.rentabilidades]; r2[i]=(parseFloat(e.target.value)||0)/100; return {...p,rentabilidades:r2}; })} style={{ ...iS, width:72 }}/>
                  <span style={{ fontSize:13, color:BD, fontWeight:600 }}>%</span>
                </div>
              ))}
            </div>
          </>)}

          {adminTab === "vendedores" && (
            <div style={crd}>
              <p style={{ fontSize:11, fontWeight:700, color:BD, margin:"0 0 12px", letterSpacing:0.8 }}>LISTA DE VENDEDORES</p>
              {as.vendedores.map((v,i) => (
                <div key={v.id} style={{ display:"flex", gap:8, marginBottom:10 }}>
                  <input value={v.nombre} onChange={e => setAs(p => { const vs=[...p.vendedores]; vs[i]={...vs[i],nombre:e.target.value}; return {...p,vendedores:vs}; })} style={{ ...iS, flex:2 }}/>
                  <button onClick={() => setAs(p => ({...p,vendedores:p.vendedores.filter((_,j)=>j!==i)}))} style={{ padding:"8px 10px", fontSize:13, borderRadius:8, border:"0.5px solid #e74c3c", color:"#c0392b", background:"none", cursor:"pointer" }}>✕</button>
                </div>
              ))}
              <button onClick={() => setAs(p => ({...p,vendedores:[...p.vendedores,{id:Date.now(),nombre:"Nuevo vendedor",pin:"0000"}]}))} style={{ ...iS, cursor:"pointer", color:"white", border:"none", background:B, marginTop:4, fontWeight:600 }}>+ Agregar vendedor</button>
            </div>
          )}

          {adminTab === "pines" && (
            <div style={crd}>
              <p style={{ fontSize:11, fontWeight:700, color:BD, margin:"0 0 12px", letterSpacing:0.8 }}>CAMBIAR PINs</p>
              <label style={lS}>Tu PIN (Admin)</label>
              <input type="password" value={as.adminPin} onChange={e => setAs(p => ({...p,adminPin:e.target.value}))} style={{ ...iS, marginBottom:14, letterSpacing:6, fontSize:18 }} placeholder="••••"/>
              {as.vendedores.map((v,i) => (
                <div key={v.id} style={{ marginBottom:12 }}>
                  <label style={lS}>PIN de {v.nombre}</label>
                  <input type="password" value={v.pin} onChange={e => setAs(p => { const vs=[...p.vendedores]; vs[i]={...vs[i],pin:e.target.value}; return {...p,vendedores:vs}; })} style={{ ...iS, letterSpacing:6, fontSize:18 }} placeholder="••••"/>
                </div>
              ))}
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}