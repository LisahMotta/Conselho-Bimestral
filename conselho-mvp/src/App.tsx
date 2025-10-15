import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx"; // ler .xlsx/.xls no navegador

// MVP Web App – Conselho (Notas & Faltas)
// Agora com: mapeamento interativo de cabeçalhos + seleção de planilha (XLSX)
// Aceita CSV, XLSX, XLS (1º, 2º e 3º bimestres)
// --------------------------------------------------------------
// Fluxo:
// 1) Faça upload dos arquivos. Se os cabeçalhos não forem reconhecidos, clique em "Mapear cabeçalhos".
// 2) Se for XLSX com várias abas, escolha a planilha.
// 3) Ajuste média/frequência mínima; confira o relatório; exporte CSV.

// ==========================
// 🔧 SELF-TESTS (dev only)
// ==========================
function runSelfTests() {
  try {
    const csv = [
      "Numero,Aluno,Situacao,Arte,Faltas,Frequência_%",
      "1,ALUNO TESTE,ATIVO,7,2,95,",
    ].join("\n");
    const rows = parseCSV(csv);
    console.assert(rows.length === 1, "[T1] parseCSV: linhas");
    console.assert((rows[0] as any)["Frequencia_%"] === 95, "[T1] parseCSV: freq normalizada e numérica");

    const linha: Linha = { Numero: "1", Aluno: "A", Arte: 8, Biologia: 6, "Educacao Financeira": 10 } as any;
    console.assert(mediaNotas(linha) === Number(((8 + 6 + 10) / 3).toFixed(2)), "[T2] mediaNotas");

    console.assert(num("7,5") === 7.5 && num("99") === 99 && num(80) === 80, "[T3] num conversões");
  } catch (e) {
    console.warn("[SELF-TEST] Falha nos testes:", e);
  }
}

if (typeof window !== "undefined") {
  try { runSelfTests(); } catch {}
}

const DISCIPLINAS = [
  "Arte",
  "Biologia",
  "Educacao Financeira",
  "Filosofia",
  "Fisica",
  "Geografia",
  "Historia",
  "Lingua Inglesa",
  "Lingua Portuguesa",
  "Matematica",
  "Quimica",
  "Redacao e Leitura",
] as const;

type Disciplina = typeof DISCIPLINAS[number];

// Registro base (um aluno por linha)
export type Linha = {
  Numero: string;
  Aluno: string;
  Situacao?: string;
  // notas por disciplina
  [K in Disciplina]?: number | string | undefined;
} & {
  Faltas?: number | string;
  "Frequencia_%"?: number | string; // chave com %
  "Frequencia_%_Acumulada"?: number | string; // pode vir no 3º bim
  "Faltas_Acumuladas"?: number | string;
};

// ===== Normalização de cabeçalhos =====
const headerMap: Record<string, string> = {
  // Identificação
  "n": "Numero",
  "no": "Numero",
  "nº": "Numero",
  "numero": "Numero",
  "aluno": "Aluno",
  "aluno(a)": "Aluno",
  "nome": "Aluno",
  "sit": "Situacao",
  "situacao": "Situacao",
  "situação": "Situacao",
  // Frequência/faltas
  "faltas": "Faltas",
  "faltas acumuladas": "Faltas_Acumuladas",
  "frequencia_%": "Frequencia_%",
  "frequência_%": "Frequencia_%",
  "freq_%": "Frequencia_%",
  "frequencia": "Frequencia_%",
  "frequência": "Frequencia_%",
  "frequencia %": "Frequencia_%",
  "frequencia_%_acumulada": "Frequencia_%_Acumulada",
  "frequência_%_acumulada": "Frequencia_%_Acumulada",
  "frequencia acumulada": "Frequencia_%_Acumulada",
  // Disciplinas (variações comuns)
  "língua portuguesa": "Lingua Portuguesa",
  "lingua portuguesa": "Lingua Portuguesa",
  "portugues": "Lingua Portuguesa",
  "português": "Lingua Portuguesa",
  "língua inglesa": "Lingua Inglesa",
  "lingua inglesa": "Lingua Inglesa",
  "ingles": "Lingua Inglesa",
  "inglês": "Lingua Inglesa",
  "educação financeira": "Educacao Financeira",
  "educacao financeira": "Educacao Financeira",
  "redação e leitura": "Redacao e Leitura",
  "redacao e leitura": "Redacao e Leitura",
  "matemática": "Matematica",
  "matematica": "Matematica",
  "física": "Fisica",
  "fisica": "Fisica",
  "história": "Historia",
  "historia": "Historia",
  "geografia": "Geografia",
  "química": "Quimica",
  "quimica": "Quimica",
  "filosofia": "Filosofia",
  "biologia": "Biologia",
  "arte": "Arte",
};

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function canonical(h: string) {
  const k = stripAccents(String(h).trim().toLowerCase());
  return headerMap[k] || DISCIPLINAS.find(d => stripAccents(d.toLowerCase()) === k) || h;
}

// CSV utilitário — tolera vírgula decimal e ; como separador
function parseCSV(text: string): Linha[] {
  const lines = text.replace(/\r\n?|\n/g, "\n").split("\n").filter(Boolean);
  if (lines.length === 0) return [];
  const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const headersRaw = lines[0].split(sep).map((h) => h.trim());
  const headers = headersRaw.map((h) => (h === "Frequência_%" ? "Frequencia_%" : canonical(h)));

  return lines.slice(1).map((line) => {
    const cols = line.split(sep).map((c) => c.trim());
    const row: any = {};
    headers.forEach((h, i) => {
      let val: any = cols[i] ?? "";
      const tryNum = val.replace?.(/\./g, "").replace?.(/,/g, ".");
      if (tryNum && /^[-+]?\d+(\.\d+)?$/.test(tryNum)) {
        val = Number(tryNum);
      }
      row[h] = val;
    });
    return row as Linha;
  });
}

// ===== XLSX helpers =====
function listSheets(file: File): Promise<string[]> {
  return file.arrayBuffer().then((data) => {
    const wb = XLSX.read(data, { type: "array" });
    return wb.SheetNames;
  });
}

async function readSheet(file: File, sheetName: string): Promise<{ headers: string[]; rows: any[]; }> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });
  const ws = wb.Sheets[sheetName];
  const json: any[] = XLSX.utils.sheet_to_json(ws, { defval: "", header: 1 }); // matriz [lin][col]
  // Detecta linha de cabeçalho com maior "score"
  let bestRow = 0, bestScore = -1;
  for (let r = 0; r < Math.min(json.length, 20); r++) {
    const row = json[r] as any[];
    if (!row || !row.length) continue;
    const score = row.reduce((s, cell) => {
      const c = canonical(String(cell || ""));
      const hit = ["Numero","Aluno","Situacao","Faltas","Frequencia_%", ...DISCIPLINAS].includes(c) ? 2 : (String(cell||"").length > 0 ? 1 : 0);
      return s + hit;
    }, 0);
    if (score > bestScore) { bestScore = score; bestRow = r; }
  }
  const headersRaw = (json[bestRow] || []).map((h: any) => String(h || ""));
  const headers = headersRaw.map((h: string) => (h === "Frequência_%" ? "Frequencia_%" : canonical(h)));
  const rows = json.slice(bestRow + 1).map((r: any[]) => {
    const obj: any = {};
    headers.forEach((h: string, i: number) => {
      let v: any = r[i] ?? "";
      if (typeof v === "string") {
        const tryNum = v.replace?.(/\./g, "").replace?.(/,/g, ".");
        if (tryNum && /^[-+]?\d+(\.\d+)?$/.test(tryNum)) v = Number(tryNum);
      }
      obj[h] = v;
    });
    return obj;
  });
  return { headers, rows };
}

function downloadCSV(filename: string, rows: any[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(",")] 
    .concat(
      rows.map((r) =>
        headers
          .map((h) => {
            const v = r[h] ?? "";
            if (typeof v === "string" && (v.includes(",") || v.includes("\n"))) {
              return `"${v.replace(/"/g, '""')}"`;
            }
            return v;
          })
          .join(","),
      ),
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function chaveAluno(l: Linha) {
  return (l.Numero?.toString().trim() || "") + "::" + (l.Aluno?.toString().trim() || "");
}

function mapPorChave(arr: Linha[]) {
  const m = new Map<string, Linha>();
  for (const a of arr) m.set(chaveAluno(a), a);
  return m;
}

// ===== Filtragem por situação =====
function normalizeSituacao(s?: string | number | null) {
  if (s == null) return "";
  try {
    return stripAccents(String(s).trim().toLowerCase());
  } catch {
    return String(s).trim().toLowerCase();
  }
}

function isExcludedSituacao(s?: string | number | null) {
  const n = normalizeSituacao(s);
  if (!n) return false;
  // Excluir transferidos, casos de não comparecimento, remanejados e baixa de transferência
  // Normalizamos acentos e caixa; usamos padrões amplos para cobrir variações
  return /transferencia|transferido|nao\s*comparec|nao_comparec|remanejad|remanejado|baixa.*transfer/.test(n);
}

function filtrarVisiveis<T extends { Situacao?: string | number | null }>(arr: T[]) {
  return arr.filter((l) => !isExcludedSituacao((l as any)?.Situacao));
}

function mediaNotas(l: Linha): number | null {
  const valores: number[] = [];
  for (const d of DISCIPLINAS) {
    const v = (l as any)[d];
    const n = typeof v === "string" ? Number(String(v).replace(",", ".")) : (v as number);
    if (Number.isFinite(n)) valores.push(n as number);
  }
  if (!valores.length) return null;
  const m = valores.reduce((s, x) => s + x, 0) / valores.length;
  return Number(m.toFixed(2));
}

function num(v: any): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

// ======= UI de mapeamento de cabeçalhos =======
const CANONICOS = [
  "(ignorar)",
  "Numero",
  "Aluno",
  "Situacao",
  "Faltas",
  "Frequencia_%",
  "Frequencia_%_Acumulada",
  ...DISCIPLINAS,
] as const;

type Canonico = typeof CANONICOS[number];

type Mapping = Record<string, Canonico>; // header original -> canônico

function Mapper({ headers, mapping, setMapping, onClose }:{
  headers: string[];
  mapping: Mapping;
  setMapping: (m: Mapping) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl p-4">
        <h3 className="text-lg font-semibold mb-3">Mapear cabeçalhos do arquivo</h3>
        <p className="text-xs text-gray-500 mb-4">Associe cada coluna do seu arquivo a um campo canônico. Deixe como “(ignorar)” para colunas irrelevantes.</p>
        <div className="max-h-96 overflow-auto border rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left">Coluna do arquivo</th>
                <th className="p-2 text-left">Mapear para</th>
              </tr>
            </thead>
            <tbody>
              {headers.map((h) => (
                <tr key={h} className="border-t">
                  <td className="p-2 font-mono">{h}</td>
                  <td className="p-2">
                    <select
                      className="border rounded-lg px-2 py-1"
                      value={mapping[h] || canonical(h) as Canonico}
                      onChange={(e) => setMapping({ ...mapping, [h]: e.target.value as Canonico })}
                    >
                      {CANONICOS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-2 rounded-xl bg-gray-900 text-white">Concluir</button>
        </div>
      </div>
    </div>
  );
}

function aplicarMapping(rows: any[], mapping: Mapping): Linha[] {
  if (!rows.length) return [];
  return rows.map((r) => {
    const out: any = {};
    Object.keys(r).forEach((orig) => {
      const destino = mapping[orig] ?? canonical(orig);
      if (!destino || destino === "(ignorar)") return;
      out[destino] = r[orig];
    });
    return out as Linha;
  });
}

export default function App() {
  const [b1, setB1] = useState<Linha[]>([]);
  const [b2, setB2] = useState<Linha[]>([]);
  const [b3, setB3] = useState<Linha[]>([]); // digitado ou carregado

  const [mediaMin, setMediaMin] = useState<number>(5);
  const [freqMin, setFreqMin] = useState<number>(75);

  // Estado de mapeamento por arquivo
  const [map1, setMap1] = useState<Mapping>({});
  const [map2, setMap2] = useState<Mapping>({});
  const [map3, setMap3] = useState<Mapping>({});
  const [headersPreview, setHeadersPreview] = useState<string[]>([]);
  const [mapperOpen, setMapperOpen] = useState<null | { qual: "b1"|"b2"|"b3" }>(null);

  // XLSX: seleção de planilhas
  const [sheets1, setSheets1] = useState<string[]>([]);
  const [sheets2, setSheets2] = useState<string[]>([]);
  const [sheets3, setSheets3] = useState<string[]>([]);
  const [sel1, setSel1] = useState<string>("");
  const [sel2, setSel2] = useState<string>("");
  const [sel3, setSel3] = useState<string>("");
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [file3, setFile3] = useState<File | null>(null);

  // Handler unificado: CSV/XLSX/XLS (com suporte a múltiplas planilhas)
  const onUploadAny = async (e: React.ChangeEvent<HTMLInputElement>, qual: "b1"|"b2"|"b3") => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.toLowerCase().split(".").pop();

    if (qual === "b1") { setFile1(f); setSel1(""); }
    if (qual === "b2") { setFile2(f); setSel2(""); }
    if (qual === "b3") { setFile3(f); setSel3(""); }

    try {
      if (ext === "csv") {
        const text = await f.text();
        const rows = parseCSV(text);
        if (qual === "b1") setB1(rows);
        if (qual === "b2") setB2(rows);
        if (qual === "b3") setB3(rows);
        setHeadersPreview(Object.keys(rows[0] || {}));
        setMapperOpen({ qual });
      } else if (ext === "xlsx" || ext === "xls") {
        const sheetNames = await listSheets(f);
        if (qual === "b1") setSheets1(sheetNames);
        if (qual === "b2") setSheets2(sheetNames);
        if (qual === "b3") setSheets3(sheetNames);
      } else {
        alert("Formato não suportado. Use CSV, XLSX ou XLS.");
      }
    } catch (err) {
      console.error("Falha ao ler arquivo:", err);
      alert("Não consegui ler o arquivo. Verifique o formato e tente novamente.");
    }
  };

  const carregarSheet = async (qual: "b1"|"b2"|"b3") => {
    const f = qual === "b1" ? file1 : qual === "b2" ? file2 : file3;
    const sheet = qual === "b1" ? sel1 : qual === "b2" ? sel2 : sel3;
    if (!f || !sheet) return;
    const { headers, rows } = await readSheet(f, sheet);
    if (qual === "b1") setB1(rows as Linha[]);
    if (qual === "b2") setB2(rows as Linha[]);
    if (qual === "b3") setB3(rows as Linha[]);
    setHeadersPreview(headers);
    setMapperOpen({ qual });
  };

  const mappingAtual = (qual: "b1"|"b2"|"b3") => (qual === "b1" ? map1 : qual === "b2" ? map2 : map3);
  const setMappingAtual = (qual: "b1"|"b2"|"b3", m: Mapping) => {
    if (qual === "b1") setMap1(m);
    if (qual === "b2") setMap2(m);
    if (qual === "b3") setMap3(m);
  };

  const aplicarMappingAtual = (qual: "b1"|"b2"|"b3") => {
    const m = mappingAtual(qual);
    if (qual === "b1") setB1((prev) => aplicarMapping(prev, m));
    if (qual === "b2") setB2((prev) => aplicarMapping(prev, m));
    if (qual === "b3") setB3((prev) => aplicarMapping(prev, m));
    setMapperOpen(null);
  };

  // Cria base de 3º bimestre a partir da união de b1 e b2 (para digitação)
  const baseTerceiro = useMemo(() => {
    const chaves = new Set<string>();
    for (const l of b1) chaves.add(chaveAluno(l));
    for (const l of b2) chaves.add(chaveAluno(l));
    const linhas: Linha[] = [];
    chaves.forEach((ch) => {
      const l1 = mapPorChave(b1).get(ch);
      const l2 = mapPorChave(b2).get(ch);
      const base: Linha = {
        Numero: l1?.Numero || l2?.Numero || "",
        Aluno: l1?.Aluno || l2?.Aluno || "",
        Situacao: l1?.Situacao || l2?.Situacao || "",
      };
      linhas.push(base);
    });
    // Filtrar alunos exclu eddos antes de mesclar com b3
    const visiveis = filtrarVisiveis(linhas);
    if (b3.length) {
      const m3 = mapPorChave(b3);
      return visiveis.map((l) => ({ ...l, ...(m3.get(chaveAluno(l)) || {}) }));
    }
    return linhas;
  }, [b1, b2, b3]);

  // Atualiza célula do 3º bimestre digitado
  const setB3Cell = (idx: number, campo: string, valor: string) => {
    setB3((prev) => {
      const next = [...(prev.length ? prev : baseTerceiro)];
      const row = { ...(next[idx] || baseTerceiro[idx]) } as any;
      const v = valor.replace(/,/g, ".");
      row[campo] = v;
      next[idx] = row;
      return next;
    });
  };

  // Junta 1º, 2º e 3º para relatório
  type LinhaOut = {
    Numero: string;
    Aluno: string;
    Situacao?: string;
    Media_1B?: number | null;
    Media_2B?: number | null;
    Media_1e2?: number | null;
    Media_3B?: number | null;
    Media_Parcial_1_2_3?: number | null;
    "Frequencia_1B_%"?: number | null;
    "Frequencia_2B_%"?: number | null;
    "Frequencia_Acumulada_%"?: number | null;
    Risco_Nota?: "SIM" | "NÃO" | "";
    Risco_Frequencia?: "SIM" | "NÃO" | "";
    ALERTA?: string;
  };

  const relatorio: LinhaOut[] = useMemo(() => {
    const m1 = mapPorChave(b1);
    const m2 = mapPorChave(b2);
    const m3 = mapPorChave(b3.length ? b3 : baseTerceiro);

    const chaves = new Set<string>([
      ...Array.from(m1.keys()),
      ...Array.from(m2.keys()),
      ...Array.from(m3.keys()),
    ]);

    const out: LinhaOut[] = [];
    chaves.forEach((ch) => {
      const l1 = m1.get(ch);
      const l2 = m2.get(ch);
      const l3 = m3.get(ch);

      const base: LinhaOut = {
        Numero: l1?.Numero || l2?.Numero || l3?.Numero || "",
        Aluno: l1?.Aluno || l2?.Aluno || l3?.Aluno || "",
        Situacao: l1?.Situacao || l2?.Situacao || l3?.Situacao || "",
      };

      base.Media_1B = l1 ? mediaNotas(l1) : null;
      base.Media_2B = l2 ? mediaNotas(l2) : null;
      base.Media_1e2 = (() => {
        const vals = [base.Media_1B, base.Media_2B].filter((x) => x != null) as number[];
        if (!vals.length) return null;
        return Number((vals.reduce((s, x) => s + x, 0) / vals.length).toFixed(2));
      })();

      base.Media_3B = l3 ? mediaNotas(l3) : null;
      base.Media_Parcial_1_2_3 = (() => {
        const vals = [base.Media_1B, base.Media_2B, base.Media_3B].filter((x) => x != null) as number[];
        if (!vals.length) return null;
        return Number((vals.reduce((s, x) => s + x, 0) / vals.length).toFixed(2));
      })();

      base["Frequencia_1B_%"] = num(l1?.["Frequencia_%"]);
      base["Frequencia_2B_%"] = num(l2?.["Frequencia_%"]);

      const freqAcum3 = num((l3 as any)?.["Frequencia_%_Acumulada"]) ?? num(l3?.["Frequencia_%"]);
      base["Frequencia_Acumulada_%"] = freqAcum3 ?? (() => {
        const vals = [base["Frequencia_1B_%"], base["Frequencia_2B_%"]].filter((x) => x != null) as number[];
        if (!vals.length) return null;
        return Math.round(vals.reduce((s, x) => s + x, 0) / vals.length);
      })();

      base.Risco_Nota = base.Media_1e2 == null ? "" : base.Media_1e2 < mediaMin ? "SIM" : "NÃO";
      base.Risco_Frequencia = base["Frequencia_Acumulada_%"] == null ? "" : (base["Frequencia_Acumulada_%"] as number) < freqMin ? "SIM" : "NÃO";
      base.ALERTA = base.Risco_Nota === "SIM" || base.Risco_Frequencia === "SIM" ? "⚠️ Verificar caso" : "";

      out.push(base);
    });

    // Filtrar alunos exclu eddos do relatorio final
    const visiveis = filtrarVisiveis(out);
    return visiveis.sort((a, b) => ((a.ALERTA || "") < (b.ALERTA || "") ? 1 : (a.ALERTA || "") > (b.ALERTA || "") ? -1 : (a.Aluno || "").localeCompare(b.Aluno || "")));
  }, [b1, b2, b3, baseTerceiro, mediaMin, freqMin]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <h1 className="text-2xl md:text-3xl font-bold">MVP – Conselho (Notas & Faltas)</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white rounded-2xl shadow px-3 py-2">
              <label className="text-sm">Média mínima</label>
              <input type="number" step="0.1" value={mediaMin} onChange={(e) => setMediaMin(Number(e.target.value))} className="w-20 border rounded-lg px-2 py-1" />
            </div>
            <div className="flex items-center gap-2 bg-white rounded-2xl shadow px-3 py-2">
              <label className="text-sm">Frequência mínima (%)</label>
              <input type="number" step="1" value={freqMin} onChange={(e) => setFreqMin(Number(e.target.value))} className="w-24 border rounded-lg px-2 py-1" />
            </div>
          </div>
        </header>

        {/* Uploads + seleção de planilhas + mapeamento */}
        <section className="grid md:grid-cols-3 gap-4">
          {/* 1º Bimestre */}
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-2">1º bimestre (CSV/XLSX/XLS)</h2>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => onUploadAny(e, "b1")} />
            {sheets1.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <select className="border rounded-lg px-2 py-1" value={sel1} onChange={(e) => setSel1(e.target.value)}>
                  <option value="">(escolher planilha)</option>
                  {sheets1.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="px-3 py-1 rounded-lg bg-gray-900 text-white" onClick={() => carregarSheet("b1")}>Carregar</button>
              </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <button className="px-3 py-1 rounded-lg bg-gray-100" onClick={() => { setHeadersPreview(Object.keys((b1[0]||{}))); setMapperOpen({ qual: "b1" }); }}>Mapear cabeçalhos</button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Linhas carregadas: {b1.length}</p>
          </div>

          {/* 2º Bimestre */}
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-2">2º bimestre (CSV/XLSX/XLS)</h2>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => onUploadAny(e, "b2")} />
            {sheets2.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <select className="border rounded-lg px-2 py-1" value={sel2} onChange={(e) => setSel2(e.target.value)}>
                  <option value="">(escolher planilha)</option>
                  {sheets2.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="px-3 py-1 rounded-lg bg-gray-900 text-white" onClick={() => carregarSheet("b2")}>Carregar</button>
              </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <button className="px-3 py-1 rounded-lg bg-gray-100" onClick={() => { setHeadersPreview(Object.keys((b2[0]||{}))); setMapperOpen({ qual: "b2" }); }}>Mapear cabeçalhos</button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Linhas carregadas: {b2.length}</p>
          </div>

          {/* 3º Bimestre */}
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-2">3º bimestre (CSV/XLSX/XLS)</h2>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => onUploadAny(e, "b3")} />
            {sheets3.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <select className="border rounded-lg px-2 py-1" value={sel3} onChange={(e) => setSel3(e.target.value)}>
                  <option value="">(escolher planilha)</option>
                  {sheets3.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="px-3 py-1 rounded-lg bg-gray-900 text-white" onClick={() => carregarSheet("b3")}>Carregar</button>
              </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <button className="px-3 py-1 rounded-lg bg-gray-100" onClick={() => { setHeadersPreview(Object.keys((b3[0]||{}))); setMapperOpen({ qual: "b3" }); }}>Mapear cabeçalhos</button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Linhas carregadas: {b3.length}</p>
          </div>
        </section>

        {/* Digitação 3º bimestre */}
        <section className="bg-white rounded-2xl shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">3º bimestre (Conselho) – Digitação rápida / conferência</h2>
            <button onClick={() => downloadCSV("relatorio_conselho.csv", relatorio)} className="px-3 py-2 bg-emerald-600 text-white rounded-xl hover:opacity-90">Exportar Relatório (CSV)</button>
          </div>

          <div className="overflow-auto border rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left">Nº</th>
                  <th className="p-2 text-left">Aluno</th>
                  {DISCIPLINAS.map((d) => (
                    <th key={d} className="p-2 text-left whitespace-nowrap">{d}</th>
                  ))}
                  <th className="p-2 text-left whitespace-nowrap">Faltas Acum.</th>
                  <th className="p-2 text-left whitespace-nowrap">Frequência % Acum.</th>
                </tr>
              </thead>
              <tbody>
                {(b3.length ? b3 : baseTerceiro).map((l, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2 w-12">{l.Numero}</td>
                    <td className="p-2 min-w-56">{l.Aluno}</td>
                    {DISCIPLINAS.map((d) => (
                      <td key={d} className="p-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-20 border rounded-lg px-2 py-1"
                          value={(l as any)[d] ?? ""}
                          onChange={(e) => setB3Cell(idx, d, e.target.value)}
                          placeholder="0-10"
                        />
                      </td>
                    ))}
                    <td className="p-1">
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-24 border rounded-lg px-2 py-1"
                        value={(l as any)["Faltas_Acumuladas"] ?? (l as any).Faltas ?? ""}
                        onChange={(e) => setB3Cell(idx, "Faltas_Acumuladas", e.target.value)}
                        placeholder="ex.: 12"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="w-28 border rounded-lg px-2 py-1"
                        value={(l as any)["Frequencia_%_Acumulada"] ?? (l as any)["Frequencia_%"] ?? ""}
                        onChange={(e) => setB3Cell(idx, "Frequencia_%_Acumulada", e.target.value)}
                        placeholder="ex.: 82"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Relatório */}
        <section className="bg-white rounded-2xl shadow p-4">
          <h2 className="font-semibold mb-3">Relatório – Risco por Nota e Frequência</h2>
          <div className="overflow-auto border rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  {[
                    "Numero","Aluno","Situacao","Media_1B","Media_2B","Media_1e2","Media_3B","Media_Parcial_1_2_3","Frequencia_1B_%","Frequencia_2B_%","Frequencia_Acumulada_%","Risco_Nota","Risco_Frequencia","ALERTA",
                  ].map((h) => (
                    <th key={h} className="p-2 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {relatorio.map((r, i) => (
                  <tr key={i} className={`border-t ${r.ALERTA ? "bg-amber-50" : ""}`}>
                    <td className="p-2">{r.Numero}</td>
                    <td className="p-2 min-w-56">{r.Aluno}</td>
                    <td className="p-2">{r.Situacao}</td>
                    <td className="p-2">{r.Media_1B ?? ""}</td>
                    <td className="p-2">{r.Media_2B ?? ""}</td>
                    <td className="p-2 font-medium">{r.Media_1e2 ?? ""}</td>
                    <td className="p-2">{r.Media_3B ?? ""}</td>
                    <td className="p-2">{r.Media_Parcial_1_2_3 ?? ""}</td>
                    <td className="p-2">{r["Frequencia_1B_%"] ?? ""}</td>
                    <td className="p-2">{r["Frequencia_2B_%"] ?? ""}</td>
                    <td className="p-2 font-medium">{r["Frequencia_Acumulada_%"] ?? ""}</td>
                    <td className={`p-2 ${r.Risco_Nota === "SIM" ? "text-red-600 font-semibold" : ""}`}>{r.Risco_Nota}</td>
                    <td className={`p-2 ${r.Risco_Frequencia === "SIM" ? "text-red-600 font-semibold" : ""}`}>{r.Risco_Frequencia}</td>
                    <td className="p-2">{r.ALERTA}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-2">Dica: filtre visualmente os casos com "⚠️ Verificar caso" para priorizar o conselho.</p>
        </section>

        {mapperOpen && (
          <Mapper
            headers={headersPreview}
            mapping={mappingAtual(mapperOpen.qual)}
            setMapping={(m) => setMappingAtual(mapperOpen.qual!, m)}
            onClose={() => aplicarMappingAtual(mapperOpen.qual!)}
          />
        )}

        <footer className="text-xs text-gray-500 text-center pt-4">
          MVP com leitura de Excel/CSV e mapeamento de cabeçalhos. Se faltar algum nome de coluna, me diga que eu adiciono ao reconhecimento automático.
        </footer>
      </div>
    </div>
  );
}
