// BurbuPack v9.3
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
const B = "#0099d8", BD = "#005f8a", BDK = "#003d5c";

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
const fmtARS = n => {
  const v = ceil(n);
  return "$ " + new Intl.NumberFormat("es-AR").format(v) + ".-";
};
const fmtMillarUSD = n => {
  const hasDecimals = (n % 1) !== 0;
  return "U$S " + (hasDecimals ? fmtDec(n,2) : fmt(n) + ".-");
};
const fmtImporte = (n, prefix="$") => {
  const hasDecimals = (n % 1) !== 0;
  return prefix + " " + (hasDecimals ? fmtDec(n,2) : fmt(n) + ".-");
};
const today  = () => new Date().toLocaleDateString("es-AR");

function getRangoIdx(m) {
  if (m <= 2)  return 0;
  if (m <= 4)  return 1;
  if (m <= 7)  return 2;
  if (m <= 10) return 3;
  return 4;
}

function calcular(inp, adm) {
  const { tipo, burbuja, capas, ancho, largo, solapa, millares, cintaRep, cintaInv, color, colorOpcion } = inp;
  // Standard siempre 200cm, Micro/Burbujón 144cm
  const anchoMaquina = burbuja === "Standard" ? 200 : 144;
  const anchoNum  = parseFloat(ancho)  || 0;
  const largoNum  = parseFloat(largo)  || 0;
  const solapaNum = parseFloat(solapa) || 0;
  const anchoReqRaw = tipo === "bolsa" ? largoNum * 2 : anchoNum;
  if (anchoReqRaw <= 0) return null;
  const anchoReq = anchoReqRaw; // sin redondeo a múltiplos de 10
  const fajas = Math.floor(anchoMaquina / anchoReq);
  if (fajas <= 0) return { anchoReq, anchoMaquina, fajas:0, error:true };
  const desperdicioCm = Math.round(anchoMaquina - fajas * anchoReq);
  const pctDesp = Math.round((desperdicioCm / anchoMaquina) * 100);
  const cantMillares = parseFloat(millares) || 0;
  const cantUnidadesInt = Math.round(cantMillares * 1000);

  const colorNegBlanc = color && (colorOpcion === "negras" || colorOpcion === "blancas");
  const capasEfectivas = (cintaRep || cintaInv || colorNegBlanc) ? "triple" : capas;

  const PESO_M2 = { Standard:0.0777, Microburbuja:0.092, Burbujón:0.092 };
  const factorTipo  = tipo === "lamina" ? 0.5 : 1;
  const factorCapas = capasEfectivas === "triple" ? 1.5 : 1;
  const factorColor = color ? 1.25 : 1;
  const costoM2ars  = (PESO_M2[burbuja]||0.0777) * adm.precioPE * adm.tipoCambio * factorTipo * factorCapas * factorColor;
  // m² real consumido por unidad: área física de la bolsa o lámina
  // Para bolsas, la solapa se dobla hacia adentro, sumando la mitad al largo
  const largoReal = tipo === "bolsa" ? (largoNum + solapaNum / 2) : largoNum;
  const m2Unidad = (anchoNum / 100) * (largoReal / 100);
  const costoMaterial = costoM2ars * m2Unidad;

  const m2Desperdicio = desperdicioCm <= 20 && cantUnidadesInt > 0
    ? ((desperdicioCm / 100) * (largoNum / 100)) / fajas : 0;
  const costoDesperdicio = costoM2ars * m2Desperdicio;

  const costoCmRep = adm.costoRolloRepegable  > 0 ? ((adm.costoRolloRepegable  * adm.tipoCambio) / (METROS_REP * 100)) : 0;
  const costoCmInv = adm.costoRolloInviolable > 0 ? ((adm.costoRolloInviolable * adm.tipoCambio) / (METROS_INV * 100)) : 0;
  let extras = 0;
  if (cintaRep) extras += costoCmRep * anchoNum;
  if (cintaInv) extras += costoCmInv * anchoNum;

  const costoPorUnidad = costoMaterial + costoDesperdicio + extras;
  const rangoIdx    = getRangoIdx(cantMillares);
  const rentaMult   = 1 + (adm.rentabilidades[rangoIdx] || 2);
  const precioBase  = costoPorUnidad * rentaMult;

  const totalBaseUSD = cantUnidadesInt > 0 ? (precioBase * cantUnidadesInt) / adm.tipoCambio : 0;
  const aplicaCalib  = cantUnidadesInt > 0 && totalBaseUSD < (adm.minimoUSD || 300);
  const calibPorUnidad = aplicaCalib ? ((adm.costoCalibacion || 100) * adm.tipoCambio) / cantUnidadesInt : 0;

  const precioPorUnidad = precioBase + calibPorUnidad;
  const precioTotal     = precioPorUnidad * cantUnidadesInt;
  const costoTotal      = costoPorUnidad  * cantUnidadesInt;
  const utilidad        = precioTotal - costoTotal;

  const metrosLinealesJumbo = (anchoNum / 100) * cantUnidadesInt;
  const rollosJumboNecesarios = Math.ceil(metrosLinealesJumbo / 200);

  return {
    anchoReq, anchoMaquina, fajas, desperdicioCm, pctDesp,
    costoPorUnidad, precioPorUnidad,
    precioPorUnidadUSD:  precioPorUnidad / adm.tipoCambio,
    precioPorMillar:     precioPorUnidad * 1000,
    precioPorMillarUSD:  (precioPorUnidad * 1000) / adm.tipoCambio,
    precioTotal,  precioTotalUSD:  precioTotal / adm.tipoCambio,
    costoTotal,   costoTotalUSD:   costoTotal  / adm.tipoCambio,
    utilidad,     utilidadUSD:     utilidad    / adm.tipoCambio,
    rentReal: costoTotal > 0 ? Math.round((utilidad / costoTotal) * 100) : 0,
    rangoLabel: RANGOS[rangoIdx].label,
    rentaPct:   Math.round(adm.rentabilidades[rangoIdx] * 100),
    cantUnidades: cantUnidadesInt, cantMillares, capasEfectivas,
    metrosLinealesJumbo, rollosJumboNecesarios, error:false,
  };
}

// Logos -30% vs v8 (88→62, 64→45)
const BurbuLogo  = () => <img src="/burbupack.png"  alt="BurbuPack" style={{ height:"clamp(40px,7vw,62px)", display:"block" }}/>;
const EmpackLogo = () => <img src="/empack.png" alt="Empack" style={{ height:"clamp(29px,5vw,45px)", display:"block" }}/>;

const BubbleHeader = () => (
  <div style={{ marginBottom:14 }}>
          <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;900&display=swap" rel="stylesheet"/>
      <div style={{ position:"relative", overflow:"hidden", borderRadius:16, minHeight:160 }}>
      <svg style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%" }} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="bg" cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#1a3a4a"/><stop offset="100%" stopColor="#060f14"/></radialGradient>
          <radialGradient id="b1" cx="35%" cy="30%" r="65%"><stop offset="0%" stopColor="rgba(255,255,255,0.18)"/><stop offset="60%" stopColor="rgba(180,220,255,0.06)"/><stop offset="100%" stopColor="rgba(100,180,255,0)"/></radialGradient>
          <radialGradient id="b2" cx="30%" cy="25%" r="65%"><stop offset="0%" stopColor="rgba(255,255,255,0.22)"/><stop offset="55%" stopColor="rgba(180,220,255,0.07)"/><stop offset="100%" stopColor="rgba(100,180,255,0)"/></radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg)"/>
        {[{cx:6,cy:20,r:22},{cx:18,cy:50,r:28},{cx:30,cy:15,r:20},{cx:42,cy:65,r:25},{cx:55,cy:25,r:22},{cx:65,cy:55,r:18},{cx:75,cy:18,r:26},{cx:85,cy:45,r:20},{cx:93,cy:22,r:18},{cx:10,cy:78,r:24},{cx:25,cy:88,r:20},{cx:40,cy:80,r:16},{cx:52,cy:90,r:22},{cx:68,cy:82,r:18},{cx:80,cy:75,r:24},{cx:92,cy:70,r:16},{cx:35,cy:40,r:14},{cx:60,cy:42,r:16},{cx:48,cy:10,r:18},{cx:72,cy:38,r:14},{cx:15,cy:35,r:12},{cx:88,cy:90,r:20},{cx:5,cy:92,r:14},{cx:97,cy:50,r:12}].map((b,i)=>(
          <g key={i}><circle cx={`${b.cx}%`} cy={`${b.cy}%`} r={`${b.r}`} fill="url(#b1)" stroke="rgba(150,210,255,0.25)" strokeWidth="0.8"/><ellipse cx={`${b.cx-b.r*0.25}%`} cy={`${b.cy-b.r*0.3}%`} rx={`${b.r*0.45}`} ry={`${b.r*0.22}`} fill="rgba(255,255,255,0.13)"/></g>
        ))}
        {[{cx:12,cy:42,r:10},{cx:22,cy:70,r:8},{cx:38,cy:28,r:11},{cx:50,cy:72,r:9},{cx:62,cy:12,r:10},{cx:70,cy:68,r:7},{cx:80,cy:30,r:8},{cx:90,cy:60,r:10},{cx:95,cy:35,r:7},{cx:45,cy:48,r:9},{cx:58,cy:85,r:8},{cx:28,cy:58,r:7},{cx:75,cy:90,r:9},{cx:8,cy:60,r:6},{cx:33,cy:95,r:8},{cx:82,cy:10,r:7}].map((b,i)=>(
          <circle key={i+30} cx={`${b.cx}%`} cy={`${b.cy}%`} r={`${b.r}`} fill="url(#b2)" stroke="rgba(150,210,255,0.2)" strokeWidth="0.6"/>
        ))}
      </svg>
      <div style={{ position:"relative", zIndex:1, display:"flex", alignItems:"center", justifyContent:"space-between", minHeight:160, padding:"12px" }}>
        <div style={{ background:"white", borderRadius:10, padding:"6px 8px", flexShrink:0 }}><BurbuLogo/></div>
        <div style={{ textAlign:"center", flex:1, padding:"0 8px" }}>
          <p style={{ color:"white", fontSize:"clamp(16px,4.5vw,24px)", fontWeight:900, letterSpacing:2, margin:0, lineHeight:1.2, textShadow:"0 1px 4px rgba(0,0,0,0.7)", fontFamily:"Nunito, sans-serif" }}>Burbupack</p>
          <p style={{ color:"rgba(255,255,255,0.9)", fontSize:"clamp(12px,3.5vw,18px)", fontWeight:600, margin:"3px 0", lineHeight:1.2, textShadow:"0 1px 4px rgba(0,0,0,0.7)", fontFamily:"Nunito, sans-serif" }}>Bolsas y láminas</p>
          <p style={{ color:"white", fontSize:"clamp(16px,4.5vw,24px)", fontWeight:900, letterSpacing:2, margin:0, lineHeight:1.2, textShadow:"0 1px 4px rgba(0,0,0,0.7)", fontFamily:"Nunito, sans-serif" }}>Cotizador</p>
        </div>
        <div style={{ background:"white", borderRadius:10, padding:"6px 8px", flexShrink:0 }}><EmpackLogo/></div>
      </div>
    </div>
  </div>
);

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

  const setAs = fn => setAsRaw(prev => {
    const next = typeof fn === "function" ? fn(prev) : fn;
    setDoc(doc(db, "config", "global"), next);
    return next;
  });

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
  const [inp, setInp] = useState({ tipo:"bolsa", burbuja:"Standard", capas:"simple", ancho:"", largo:"", solapa:"", millares:"", cintaRep:false, cintaInv:false, color:false, colorOpcion:"", colorNombre:"" });
  const [res, setRes] = useState(null);

  const setI = (k,v) => setInp(p => ({ ...p, [k]:v }));

  useEffect(() => { setRes(calcular(inp, as)); }, [inp, as.precioPE, as.costoRolloRepegable, as.costoRolloInviolable, as.rentabilidades, as.tipoCambio, as.minimoUSD, as.costoCalibacion]);

  async function fetchDolar() {
    setDolarLoading(true);
    try {
      const r = await fetch("https://dolarapi.com/v1/dolares/oficial");
      const d = await r.json();
      if (d?.venta) setAs(p => ({ ...p, tipoCambio: d.venta }));
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
    let nombre = clienteNombre.trim();
    if (!nombre) {
      nombre = window.prompt("Nombre del cliente (obligatorio):") || "";
      if (!nombre.trim()) { alert("El nombre del cliente es obligatorio para enviar por WhatsApp."); return; }
    }
    const vend = role === "admin" ? "Admin" : as.vendedores.find(x => x.id === vidId)?.nombre || "";
    const tipo = inp.tipo === "bolsa" ? "Bolsa" : "Lámina";
    const solapaV = parseFloat(inp.solapa) || 0;
    const solapaStr = inp.tipo === "bolsa" && solapaV > 0 ? ` | Solapa: ${inp.solapa} cm` : "";
    const med = inp.tipo === "bolsa" ? `${inp.ancho}x${inp.largo} cm${solapaStr}` : `${inp.ancho}x${inp.largo} cm`;
    const colorStr = inp.color ? ` | Color: ${inp.colorOpcion === "otro" ? inp.colorNombre : inp.colorOpcion}` : "";
    const extras = [inp.cintaRep && "Cinta repegable", inp.cintaInv && "Cinta inviolable"].filter(Boolean).join(", ");
    const extrasStr = extras ? ` | ${extras}` : "";
    const msg =
`*BurbuPack - cotizacion*

*Empack Inc SRL* - ${vend}
Fecha: ${today()}
Cliente: *${nombre}*

*Producto: ${tipo} ${inp.burbuja} ${res.capasEfectivas}*
*Medidas: ${med}${extrasStr}${colorStr}*
*Cantidad: ${res.cantMillares} mil (${res.cantUnidades.toLocaleString("es-AR")} u.)*

*Por millar:*
*U$S ${fmtDec(res.precioPorMillarUSD,2)}${res.precioPorMillarUSD % 1 === 0 ? ".-" : ""}*
$ ${fmt(res.precioPorMillar)}.-

*TOTAL:*
*U$S ${fmt(res.precioTotalUSD)}.- + IVA*
$ ${fmt(res.precioTotal)}.- + IVA

TC: $ ${fmt(as.tipoCambio)} ARS/USD`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  }

  function pdf() {
    if (!res || res.error) return;
    const vend = role === "admin" ? "Administrador" : as.vendedores.find(v => v.id === vidId)?.nombre || "";
    const tipo = inp.tipo === "bolsa" ? "Bolsa" : "Lámina";
    const tipoLabel = inp.tipo === "bolsa" ? "Bolsas" : "Láminas";
    const solapaV = parseFloat(inp.solapa) || 0;
    const solapaStr = inp.tipo === "bolsa" && solapaV > 0 ? ` | Solapa: ${inp.solapa} cm` : "";
    const med = inp.tipo === "bolsa" ? `Ancho: ${inp.ancho} cm | Largo: ${inp.largo} cm${solapaStr}` : `Ancho: ${inp.ancho} cm | Largo: ${inp.largo} cm`;
    const colorLabel = inp.color ? `Color: ${inp.colorOpcion === "otro" ? inp.colorNombre : inp.colorOpcion}` : "";
    const extras = [inp.cintaRep && "Cinta repegable", inp.cintaInv && "Cinta inviolable", colorLabel].filter(Boolean).join(", ") || "Ninguno";
    let clientePDF = clienteNombre.trim();
    if (!clientePDF) {
      clientePDF = window.prompt("Nombre del cliente (obligatorio para el PDF):") || "";
      if (!clientePDF.trim()) { alert("El nombre del cliente es obligatorio para generar el PDF."); return; }
    }
    const millarUSDpdf = res.precioPorMillarUSD % 1 === 0
      ? "U$S " + fmt(res.precioPorMillarUSD) + ".-"
      : "U$S " + fmtDec(res.precioPorMillarUSD, 2);
    const filename = `BurbuPack-${tipoLabel}-${inp.ancho}x${inp.largo}cm-${today().replace(/\//g,"-")}-${clientePDF.replace(/\s/g,"_")}`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filename}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f4f8;color:#1a1a2e}
.page{background:white;max-width:750px;margin:0 auto;box-shadow:0 4px 24px rgba(0,0,0,0.12)}
.header{background:linear-gradient(135deg,#003d5c,#0099d8);padding:20px 28px;display:flex;justify-content:space-between;align-items:center}
.hlogo{background:white;border-radius:10px;padding:7px 10px;display:flex;align-items:center}
.hlogo img{height:52px}
.title-section{background:#e6f6fd;padding:14px 28px;border-bottom:3px solid #0099d8}
.title-main{font-size:20px;font-weight:800;color:#003d5c;letter-spacing:1px}
.title-sub{font-size:14px;color:#005f8a;margin-top:3px;font-weight:600}
.meta{padding:10px 28px;background:#fafbfc;border-bottom:1px solid #e0e8f0;font-size:15px;color:#333;display:flex;gap:24px}
.body{padding:20px 28px}
table{width:100%;border-collapse:collapse;margin-bottom:18px}
th{background:#0099d8;color:white;text-align:left;padding:10px 14px;font-size:13px;font-weight:700;letter-spacing:.4px}
td{padding:11px 14px;font-size:15px;border-bottom:1px solid #eef2f7}
td:first-child{font-weight:600;color:#005f8a;font-size:13px;width:30%}
tr:nth-child(even) td{background:#f7fbff}
.price-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}
.pbox{border:2px solid #0099d8;border-radius:12px;padding:14px 16px;background:white}
.pbox .lbl{font-size:10px;color:#005f8a;font-weight:800;letter-spacing:1px;margin-bottom:7px}
.pbox .usd{font-size:17px;font-weight:800;color:#003d5c}
.pbox .ars{font-size:14px;color:#0099d8;margin-top:4px;font-weight:600}
.total-box{background:linear-gradient(135deg,#003d5c,#0077b6);border-radius:14px;padding:24px 28px;color:white;box-shadow:0 8px 32px rgba(0,100,180,0.35);border:3px solid #00c3ff}
.total-box .lbl{font-size:13px;opacity:.85;margin-bottom:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
.total-box .usd{font-size:34px;font-weight:900;margin-bottom:6px;text-shadow:0 2px 8px rgba(0,0,0,0.3)}
.total-box .ars{font-size:22px;font-weight:700;opacity:.92}
.total-box .tc{font-size:12px;opacity:.65;margin-top:12px}
.footer{padding:14px 28px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eef2f7;background:#fafbfc}
</style></head><body><div class="page">
<div class="header">
  <div class="hlogo"><img src="/burbupack.png"/></div>
  <div class="hlogo"><img src="/empack.png" style="height:40px"/></div>
</div>
<div class="title-section">
  <div class="title-main">BurbuPack ${tipoLabel} Cotizacion</div>
  <div class="title-sub">Vendedor: ${vend}</div>
</div>
<div class="meta">
  <span>Fecha: <b>${today()}</b></span>
  <span>Cliente: <b>${clientePDF}</b></span>
</div>
<div class="body">
<table><tr><th colspan="2">Detalle del producto</th></tr>
<tr><td>Tipo</td><td><b>${tipo} ${inp.burbuja} — ${res.capasEfectivas}</b></td></tr>
<tr><td>Medidas</td><td><b>${med}</b></td></tr>
<tr><td>Cantidad</td><td><b>${res.cantMillares} millares</b> (${res.cantUnidades.toLocaleString("es-AR")} unidades)</td></tr>
<tr><td>Extras</td><td>${extras}</td></tr>
</table>
<div class="price-grid">
<div class="pbox"><div class="lbl">POR UNIDAD</div><div class="usd">U$S ${fmtDec(res.precioPorUnidadUSD,3)}</div><div class="ars">$ ${fmt(res.precioPorUnidad)}.-</div></div>
<div class="pbox"><div class="lbl">POR MILLAR</div><div class="usd">${millarUSDpdf}</div><div class="ars">$ ${fmt(res.precioPorMillar)}.-</div></div>
</div>
<div class="total-box">
<div class="lbl">Total del pedido — ${res.cantMillares} mil (${res.cantUnidades.toLocaleString("es-AR")} u.)</div>
<div class="usd">U$S ${fmt(res.precioTotalUSD)}.- <span style="font-size:16px;font-weight:400">+ IVA</span></div>
<div class="ars">$ ${fmt(res.precioTotal)}.- <span style="font-size:14px;font-weight:400">+ IVA</span></div>
<div class="tc">Tipo de cambio: $ ${fmt(as.tipoCambio)} ARS/USD</div>
</div>
</div>
<div class="footer">Cotizacion generada por Empack Inc SRL / BurbuPack — ${today()}</div>
</div></body></html>`;
    const w = window.open("", "_blank");
    w.document.write(html); w.document.close();
    setTimeout(() => { w.document.title = filename; w.print(); }, 500);
  }

  const iS   = { width:"100%", boxSizing:"border-box", padding:"10px 12px", fontSize:"clamp(14px,3.5vw,16px)", borderRadius:8, border:`1.5px solid ${B}50`, background:"var(--color-background-primary)", color:"var(--color-text-primary)" };
  const lS   = { fontSize:"clamp(11px,2.5vw,13px)", color:BD, marginBottom:4, display:"block", fontWeight:500, letterSpacing:0.3 };
  const crd  = { background:"var(--color-background-primary)", border:`0.5px solid ${B}30`, borderRadius:14, padding:"clamp(10px,3vw,16px)", marginBottom:12, boxShadow:`0 1px 4px rgba(0,153,216,0.07)` };
  const mC   = { background:"white", borderRadius:10, padding:"10px 12px", flex:1, minWidth:0, border:`1.5px solid ${B}` };
  const tBtn   = act => ({ flex:1, padding:"10px 4px", fontSize:"clamp(12px,2.8vw,14px)", borderRadius:9, cursor:"pointer", background:act?B:"transparent", color:act?"white":BD, border:`1.5px solid ${B}`, fontWeight:act?600:400 });
  const togBtn = act => ({ flex:1, padding:"9px 4px", fontSize:"clamp(11px,2.5vw,13px)", borderRadius:8, cursor:"pointer", background:act?`${B}18`:"white", color:act?BDK:BD, border:`1.5px solid ${B}`, fontWeight:act?600:400 });

  // Input numérico sin cero a la izquierda
  const numInput = (k) => ({
    ...iS,
    value: inp[k],
    onChange: e => {
      const v = e.target.value;
      setI(k, v === "" ? "" : v.replace(/^0+(\d)/, "$1"));
    },
    onFocus: e => { if (inp[k] === "0" || inp[k] === 0) setI(k, ""); },
    type:"number", min:"0", placeholder:"0"
  });

  if (loading) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:300, gap:16 }}>
      <BurbuLogo/><p style={{ color:BD, fontSize:14 }}>Cargando...</p>
    </div>
  );

  if (screen === "login") return (
    <div style={{ fontFamily:"var(--font-sans)", minHeight:400, background:"var(--color-background-primary)", maxWidth:860, margin:"0 auto" }}>
      <BubbleHeader/>
      <div style={{ padding:"0 16px" }}>
        {loginStep === "select" && (
          <div style={crd}>
            <p style={{ ...lS, marginBottom:12, fontSize:14 }}>¿Quién sos?</p>
            <button onClick={() => { setRole("admin"); setLoginStep("pin"); }} style={{ ...iS, marginBottom:8, cursor:"pointer", textAlign:"left", background:`${B}12`, fontWeight:500 }}>🔑 Gerente comercial (Admin)</button>
            {as.vendedores.map(v => (
              <button key={v.id} onClick={() => { setRole("vendedor"); setVidId(v.id); setLoginStep("pin"); }} style={{ ...iS, marginBottom:8, cursor:"pointer", textAlign:"left", background:"var(--color-background-secondary)" }}>👤 {v.nombre}</button>
            ))}
          </div>
        )}
        {loginStep === "pin" && (
          <div style={crd}>
            <p style={{ ...lS, marginBottom:12, fontSize:14 }}>PIN — {role === "admin" ? "Admin" : as.vendedores.find(v => v.id === vidId)?.nombre}</p>
            <input type="password" maxLength={6} value={pinInput} onChange={e => setPinInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} style={{ ...iS, fontSize:24, letterSpacing:8, textAlign:"center", marginBottom:8 }} placeholder="••••" autoFocus/>
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
  const solapaV = parseFloat(inp.solapa) || 0;
  const medidaError = anchoV > 0 && (anchoV < lim.anchoMin || anchoV > lim.anchoMax)
    ? `Ancho debe ser entre ${lim.anchoMin} y ${lim.anchoMax} cm para ${inp.burbuja}.`
    : largoV > 0 && (largoV < lim.largoMin || largoV > lim.largoMax)
    ? `Largo debe ser entre ${lim.largoMin} y ${lim.largoMax} cm para ${inp.burbuja}.` : null;

  const solapaError = inp.tipo === "bolsa"
    ? usaCinta && (solapaV <= 0 || inp.solapa.trim() === "")
      ? "La solapa es obligatoria cuando hay cinta."
      : solapaV > 0
        ? solapaV < 3 ? "La solapa debe ser igual o mayor a 3 cm."
          : largoV > 0 && solapaV > largoV * 0.5 ? `La solapa no puede superar el 50% del largo (máx. ${largoV * 0.5} cm).`
          : null
        : null
    : null;

  const usaCinta = inp.cintaRep || inp.cintaInv;
  const colorNombreL = (inp.colorNombre || "").trim().toLowerCase();
  const colorEspecial = inp.color && inp.colorOpcion === "otro" && colorNombreL !== "" && colorNombreL !== "negro" && colorNombreL !== "blanco";
  const colorError = colorEspecial && res && !res.error && res.cantMillares > 0
    ? res.precioTotalUSD < 1000 ? `El color "${inp.colorNombre}" requiere pedido mínimo de U$S 1.000. Total actual: U$S ${Math.ceil(res.precioTotalUSD)}.` : null : null;

  const misCot = role === "admin" ? as.cotizaciones : as.cotizaciones.filter(c => c.vendedor === as.vendedores.find(v => v.id === vidId)?.nombre);

  return (
    <div style={{ fontFamily:"var(--font-sans)", background:"var(--color-background-primary)", minHeight:400, maxWidth:860, margin:"0 auto" }}>
      <BubbleHeader/>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 16px 8px" }}>
        <span style={{ color:BD, fontSize:13, fontWeight:500 }}>{role === "admin" ? "Admin" : as.vendedores.find(v => v.id === vidId)?.nombre}</span>
        <button onClick={() => { setScreen("login"); setLoginStep("select"); setPinInput(""); setRole(null); }} style={{ fontSize:12, color:BD, background:"none", border:`1px solid ${B}50`, borderRadius:6, cursor:"pointer", padding:"4px 10px" }}>Salir</button>
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
              {BURBUJAS.map(b => <button key={b.value} onClick={() => setI("burbuja",b.value)} style={{ ...togBtn(inp.burbuja===b.value), flex:1, fontSize:"clamp(10px,2.5vw,12px)", padding:"8px 2px" }}>{b.label}</button>)}
            </div>
<label style={lS}>Capas {usaCinta && "(→ Triple automático)"}</label>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              {["simple","triple"].map(c => <button key={c} onClick={() => setI("capas",c)} style={togBtn(inp.capas===c)}>{c==="simple"?"Simple":"Triple"}</button>)}
            </div>
            {usaCinta && <p style={{ fontSize:11, color:B, margin:"-8px 0 10px", fontWeight:500 }}>⚡ Cinta seleccionada: se aplica automáticamente Capas Triple</p>}
            {/* Medidas: ancho, largo, cantidad, solapa */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
              <div><label style={lS}>Ancho (cm)</label><input {...numInput("ancho")} style={iS}/></div>
              <div><label style={lS}>Largo (cm)</label><input {...numInput("largo")} style={iS}/></div>
              <div><label style={lS}>Cantidad (millares)</label><input {...numInput("millares")} step="0.5" style={iS} placeholder="ej: 2.5"/></div>
              {inp.tipo==="bolsa" && <div><label style={lS}>Solapa (cm)</label><input {...numInput("solapa")} style={iS} placeholder="≥ 3 cm"/></div>}
            </div>

            <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom: inp.color ? 10 : 0 }}>
              {usaCinta && (
                <div style={{ width:"100%", background:"#fff8e1", border:`0.5px solid #f39c12`, borderRadius:10, padding:"10px 14px", marginBottom:10 }}>
                  <p style={{ color:"#b7770d", fontSize:13, margin:0, fontWeight:600 }}>⚠️ Con cinta se aplica automáticamente <strong>Capas Triple</strong></p>
                </div>
              )}
              <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, color:BD, cursor:"pointer", fontWeight:500 }}>
                <input type="checkbox" checked={inp.cintaRep} onChange={e => { if(e.target.checked) setInp(p=>({...p,cintaRep:true,cintaInv:false})); else setI("cintaRep",false); }}/>Cinta repegable
              </label>
              <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, color:BD, cursor:"pointer", fontWeight:500 }}>
                <input type="checkbox" checked={inp.cintaInv} onChange={e => { if(e.target.checked) setInp(p=>({...p,cintaInv:true,cintaRep:false})); else setI("cintaInv",false); }}/>Cinta inviolable
              </label>
              <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, color:BD, cursor:"pointer", fontWeight:500 }}>
                <input type="checkbox" checked={inp.color} onChange={e => setI("color",e.target.checked)}/>Color
              </label>
            </div>

            {inp.color && (
              <div style={{ marginTop:8 }}>
                <label style={lS}>Tipo de color</label>
                <div style={{ display:"flex", gap:8 }}>
                  {["negras","blancas","otro"].map(op => (
                    <button key={op} onClick={() => setInp(p=>({...p,colorOpcion:op,colorNombre:""}))} style={{ ...togBtn(inp.colorOpcion===op), flex:1 }}>{op==="negras"?"Negras":op==="blancas"?"Blancas":"Otro"}</button>
                  ))}
                </div>
                {inp.colorOpcion === "otro" && (
                  <input value={inp.colorNombre} onChange={e => setI("colorNombre",e.target.value)} style={{ ...iS, marginTop:8 }} placeholder="Especificá el color..."/>
                )}
              </div>
            )}
          </div>

          {medidaError && <div style={{ background:"#fdf2f2", border:`0.5px solid #e74c3c`, borderRadius:10, padding:"10px 14px", marginBottom:12 }}><p style={{ color:"#c0392b", fontSize:13, margin:0, fontWeight:500 }}>⚠️ {medidaError}</p></div>}
          {solapaError && <div style={{ background:"#fff8e1", border:`0.5px solid #f39c12`, borderRadius:10, padding:"10px 14px", marginBottom:12 }}><p style={{ color:"#b7770d", fontSize:13, margin:0, fontWeight:500 }}>⚠️ {solapaError}</p></div>}
          {colorError  && <div style={{ background:"#fff8e1", border:`0.5px solid #f39c12`, borderRadius:10, padding:"10px 14px", marginBottom:12 }}><p style={{ color:"#b7770d", fontSize:13, margin:0, fontWeight:500 }}>⚠️ {colorError}</p></div>}

          {res && !res.error && res.cantMillares > 0 && !solapaError && !medidaError && !colorError && (<>
            {role === "admin" && (
              <div style={{ background:"#e6f6fd", border:`0.5px solid ${B}40`, borderRadius:14, padding:14, marginBottom:12 }}>
                <p style={{ fontSize:11, color:BD, margin:"0 0 10px", fontWeight:700, letterSpacing:0.8 }}>FABRICACIÓN</p>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {[
                    ["Ancho Jumbo Requerido", res.anchoReq+" cm"],
                    ["Ancho útil máquina", res.anchoMaquina+" cm"],
                    ["Rollos Jumbo por bajada", res.fajas],
                    ["Desperdicio", res.desperdicioCm+" cm ("+res.pctDesp+"%)"],
                    ["Metros lineales a fabricar", fmt(res.metrosLinealesJumbo)+" mts"],
                    ["Rollos Jumbo necesarios", `${res.rollosJumboNecesarios} de ${res.anchoReq} cm por 200 mts c/u`],
                  ].map(([k,v]) => (
                    <div key={k}><p style={{ fontSize:11, color:BD, margin:"0 0 2px" }}>{k}</p><p style={{ fontSize:14, fontWeight:600, margin:0, color:BDK }}>{v}</p></div>
                  ))}
                </div>
              </div>
            )}

            <div style={crd}>
              <p style={{ fontSize:11, color:BD, margin:"0 0 10px", fontWeight:700, letterSpacing:0.8 }}>PRECIO</p>
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <div style={mC}>
                  <p style={{ fontSize:11, color:BD, margin:"0 0 3px", fontWeight:600 }}>Por unidad</p>
                  <p style={{ fontSize:17, fontWeight:700, margin:"0 0 1px", color:"#000" }}>U$S {fmtDec(res.precioPorUnidadUSD,3)}</p>
                  <p style={{ fontSize:14, color:B, margin:0, fontWeight:600 }}>{fmtImporte(res.precioPorUnidad)}</p>
                </div>
                <div style={mC}>
                  <p style={{ fontSize:11, color:BD, margin:"0 0 3px", fontWeight:600 }}>Por millar</p>
                  <p style={{ fontSize:17, fontWeight:700, margin:"0 0 1px", color:"#000" }}>{fmtMillarUSD(res.precioPorMillarUSD)}</p>
                  <p style={{ fontSize:14, color:B, margin:0, fontWeight:600 }}>{fmtImporte(res.precioPorMillar)}</p>
                </div>
              </div>

              <div style={{ background:`linear-gradient(135deg,${B},${BD})`, borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
                <p style={{ fontSize:14, color:"rgba(255,255,255,0.75)", margin:"0 0 6px", fontWeight:600 }}>Total del pedido — {res.cantMillares} mil ({res.cantUnidades.toLocaleString("es-AR")} u.)</p>
                <p style={{ fontSize:34, fontWeight:700, margin:"0 0 2px", color:"white" }}>U$S {fmt(res.precioTotalUSD)}.- <span style={{ fontSize:19, fontWeight:400 }}>+ IVA</span></p>
                <p style={{ fontSize:23, fontWeight:600, color:"rgba(255,255,255,0.9)", margin:0 }}>{fmtImporte(res.precioTotal)} <span style={{ fontSize:15, fontWeight:400, opacity:0.8 }}>+ IVA</span></p>
                <p style={{ fontSize:14, color:"rgba(255,255,255,0.55)", margin:"8px 0 0" }}>TC: $ {fmt(as.tipoCambio)} ARS/USD</p>
              </div>

              {role === "admin" && (
                <div style={{ background:"#1a1a2e", borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
                  <p style={{ fontSize:11, color:"rgba(255,255,255,0.6)", margin:"0 0 10px", fontWeight:700, letterSpacing:0.8 }}>RENTABILIDAD DEL PEDIDO</p>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                    <div><p style={{ fontSize:11, color:"rgba(255,255,255,0.5)", margin:"0 0 3px" }}>Costo Total</p><p style={{ fontSize:13, fontWeight:700, color:"white", margin:"0 0 2px" }}>$ {fmt(res.costoTotal)}</p><p style={{ fontSize:11, color:"#7ecbf5", margin:0 }}>U$S {fmt(res.costoTotalUSD)}</p></div>
                    <div><p style={{ fontSize:11, color:"rgba(255,255,255,0.5)", margin:"0 0 3px" }}>Utilidad</p><p style={{ fontSize:13, fontWeight:700, color:"#4cd964", margin:"0 0 2px" }}>$ {fmt(res.utilidad)}</p><p style={{ fontSize:11, color:"#7ecbf5", margin:0 }}>U$S {fmt(res.utilidadUSD)}</p></div>
                    <div><p style={{ fontSize:11, color:"rgba(255,255,255,0.5)", margin:"0 0 3px" }}>Rentabilidad</p><p style={{ fontSize:22, fontWeight:700, color:"#4cd964", margin:0 }}>{res.rentReal}%</p></div>
                  </div>
                </div>
              )}

              <label style={lS}>Cliente (para guardar)</label>
              <input value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} style={{ ...iS, marginBottom:8 }} placeholder="Nombre del cliente"/>
              {savedMsg && <p style={{ color:"#27ae60", fontSize:13, margin:"0 0 8px", fontWeight:500 }}>{savedMsg}</p>}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
                <button onClick={guardar}  style={{ padding:"10px 4px", fontSize:12, borderRadius:9, border:`1.5px solid ${B}`, background:"#e6f6fd", cursor:"pointer", color:BD, fontWeight:600 }}>💾 Guardar</button>
                <button onClick={whatsapp} style={{ padding:"10px 4px", fontSize:12, borderRadius:9, border:"none", background:"#25D366", cursor:"pointer", color:"white", fontWeight:600 }}>📲 WhatsApp</button>
                <button onClick={pdf}      style={{ padding:"10px 4px", fontSize:12, borderRadius:9, border:`1.5px solid ${B}`, background:"#e6f6fd", cursor:"pointer", color:BD, fontWeight:600 }}>🖨 PDF</button>
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
                  <p style={{ fontSize:13, color:"var(--color-text-secondary)", margin:"0 0 8px" }}>{c.inp.tipo==="bolsa"?"Bolsa":"Lámina"} {c.inp.burbuja} {c.res.capasEfectivas||c.inp.capas} · {c.res.cantMillares} mil u.</p>
                  <div style={{ display:"flex", gap:8 }}>
                    <div style={mC}><p style={{ fontSize:11, color:BD, margin:"0 0 2px", fontWeight:600 }}>USD</p><p style={{ fontSize:15, fontWeight:700, margin:0, color:BDK }}>U$S {fmt(c.res.precioTotalUSD)}</p></div>
                    <div style={mC}><p style={{ fontSize:11, color:BD, margin:"0 0 2px", fontWeight:600 }}>ARS</p><p style={{ fontSize:15, fontWeight:700, margin:0, color:BDK }}>$ {fmt(c.res.precioTotal)}</p></div>
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
                <button onClick={fetchDolar} style={{ padding:"10px 12px", fontSize:13, borderRadius:8, border:`1px solid ${B}`, background:B, color:"white", cursor:"pointer", fontWeight:600, whiteSpace:"nowrap" }}>{dolarLoading?"...":"🔄 Actualizar"}</button>
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
                  <div key={b} style={{ background:"#e6f6fd", borderRadius:8, padding:"8px 10px", border:`0.5px solid ${B}25` }}>
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
                <div><label style={lS}>Mínimo pedido (USD)</label><div style={{ display:"flex", alignItems:"center", gap:8 }}><span style={{ fontSize:14, color:BD, fontWeight:600 }}>U$S</span><input type="number" step="10" value={as.minimoUSD||300} onChange={e => setAs(p => ({...p,minimoUSD:parseFloat(e.target.value)||0}))} style={{ ...iS, flex:1 }}/></div></div>
                <div><label style={lS}>Costo calibración (USD)</label><div style={{ display:"flex", alignItems:"center", gap:8 }}><span style={{ fontSize:14, color:BD, fontWeight:600 }}>U$S</span><input type="number" step="10" value={as.costoCalibacion||100} onChange={e => setAs(p => ({...p,costoCalibacion:parseFloat(e.target.value)||0}))} style={{ ...iS, flex:1 }}/></div></div>
              </div>
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
                  <button onClick={() => setAs(p => ({...p,vendedores:p.vendedores.filter((_,j)=>j!==i)}))} style={{ padding:"8px 10px", fontSize:13, borderRadius:8, border:"1.5px solid #e74c3c", color:"#c0392b", background:"none", cursor:"pointer" }}>✕</button>
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