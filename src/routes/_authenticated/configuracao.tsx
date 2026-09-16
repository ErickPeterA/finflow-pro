import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, createServerOnlyFn, useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Eye, FileSpreadsheet, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAuthenticatedUser } from "@/lib/auth-middleware";

type Empresa = { id: string; nome: string };
type Celula = string | number | boolean | null;
type Categoria = {
  id: string;
  empresaId: string;
  nome: string;
  dados: Record<string, Celula>;
  origem: "manual" | "planilha";
  abaOrigem: string | null;
  atualizadoEm: string;
};
type AbaImportada = {
  nome: string;
  empresaId: string | null;
  linhas: Array<Record<string, Celula>>;
};

const empresasVazias: Empresa[] = [];
const categoriasVazias: Categoria[] = [];

const servidor = createServerOnlyFn(async () => import("@/lib/postgres"));

async function exigirAdmin(userId: string) {
  const { query } = await servidor();
  const acesso = await query("select 1 from user_roles where user_id=$1::uuid and role='admin'", [
    userId,
  ]);
  if (!acesso.rowCount) throw new Error("Acesso restrito a administradores.");
}

const listarConfiguracao = createServerFn({ method: "GET" })
  .middleware([requireAuthenticatedUser])
  .handler(async ({ context }) => {
    await exigirAdmin(String(context.userId));
    const { query } = await servidor();
    const [empresas, categorias] = await Promise.all([
      query<Empresa>("select id,nome from empresas where ativo=true order by nome"),
      query<{
        id: string;
        empresa_id: string;
        nome: string;
        dados: Record<string, Celula>;
        origem: "manual" | "planilha";
        aba_origem: string | null;
        updated_at: string;
      }>(
        "select id,empresa_id,nome,dados,origem,aba_origem,updated_at from auditoria_categorias where ativo=true order by nome",
      ),
    ]);
    return {
      empresas: empresas.rows,
      categorias: categorias.rows.map((c) => ({
        id: c.id,
        empresaId: c.empresa_id,
        nome: c.nome,
        dados: c.dados,
        origem: c.origem,
        abaOrigem: c.aba_origem,
        atualizadoEm: c.updated_at,
      })),
    };
  });

const salvarCategoria = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((data: { empresaId: string; nome: string; dados?: Record<string, Celula> }) => {
    if (!data.empresaId || !data.nome.trim())
      throw new Error("Informe a empresa e o nome da categoria.");
    return { ...data, nome: data.nome.trim().slice(0, 240), dados: data.dados ?? {} };
  })
  .handler(async ({ context, data }) => {
    await exigirAdmin(String(context.userId));
    const { query } = await servidor();
    await query(
      "insert into auditoria_categorias (empresa_id,nome,dados,origem,created_by) values ($1,$2,$3::jsonb,'manual',$4) on conflict (empresa_id,nome) do update set dados=excluded.dados,ativo=true,updated_at=now()",
      [data.empresaId, data.nome, JSON.stringify(data.dados), String(context.userId)],
    );
    return { ok: true };
  });

const excluirCategoria = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    await exigirAdmin(String(context.userId));
    const { query } = await servidor();
    await query("update auditoria_categorias set ativo=false where id=$1::uuid", [data.id]);
    return { ok: true };
  });

const importarCategorias = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((data: { nomeArquivo: string; abas: AbaImportada[] }) => data)
  .handler(async ({ context, data }) => {
    await exigirAdmin(String(context.userId));
    const abas = data.abas.filter((a) => a.empresaId && a.linhas.length);
    if (!abas.length) throw new Error("Nenhuma aba vinculada a uma empresa possui categorias.");
    const { withTransaction } = await servidor();
    let total = 0;
    await withTransaction(async (client) => {
      const imp = await client.query<{ id: string }>(
        "insert into auditoria_categoria_importacoes (nome_arquivo,total_abas,created_by) values ($1,$2,$3) returning id",
        [data.nomeArquivo.slice(0, 240), abas.length, String(context.userId)],
      );
      const importacaoId = imp.rows[0]!.id;
      for (const aba of abas) {
        for (const linha of aba.linhas) {
          const nome = extrairNome(linha);
          if (!nome) continue;
          await client.query(
            "insert into auditoria_categorias (empresa_id,nome,dados,origem,aba_origem,importacao_id,created_by) values ($1,$2,$3::jsonb,'planilha',$4,$5,$6) on conflict (empresa_id,nome) do update set dados=excluded.dados,origem='planilha',aba_origem=excluded.aba_origem,importacao_id=excluded.importacao_id,ativo=true,updated_at=now()",
            [
              aba.empresaId,
              nome.slice(0, 240),
              JSON.stringify(linha),
              aba.nome,
              importacaoId,
              String(context.userId),
            ],
          );
          total++;
        }
      }
      await client.query(
        "update auditoria_categoria_importacoes set total_categorias=$1 where id=$2",
        [total, importacaoId],
      );
    });
    return { total, empresas: abas.length };
  });

export const Route = createFileRoute("/_authenticated/configuracao")({
  head: () => ({ meta: [{ title: "Configuração da Auditoria | VG Finance" }] }),
  component: ConfiguracaoPage,
});

function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}
function extrairNome(linha: Record<string, Celula>) {
  const chave = Object.keys(linha).find((k) =>
    ["categoria", "nomecategoria", "nomedacategoria", "nome", "descricao"].includes(normalizar(k)),
  );
  const valor = chave
    ? linha[chave]
    : Object.values(linha).find((v) => typeof v === "string" && v.trim());
  return String(valor ?? "").trim();
}

function ConfiguracaoPage() {
  const queryClient = useQueryClient();
  const listar = useServerFn(listarConfiguracao),
    salvar = useServerFn(salvarCategoria),
    remover = useServerFn(excluirCategoria),
    importar = useServerFn(importarCategorias);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [empresaId, setEmpresaId] = useState("todas"),
    [busca, setBusca] = useState("");
  const [abas, setAbas] = useState<AbaImportada[]>([]),
    [arquivo, setArquivo] = useState("");
  const [dialogImportacao, setDialogImportacao] = useState(false),
    [dialogNova, setDialogNova] = useState(false);
  const [categoriaAberta, setCategoriaAberta] = useState<Categoria | null>(null);
  const [nova, setNova] = useState({ empresaId: "", nome: "" });
  const painel = useQuery({ queryKey: ["configuracao-auditoria"], queryFn: () => listar() });
  const empresas = painel.data?.empresas ?? empresasVazias,
    categorias = painel.data?.categorias ?? categoriasVazias;
  const mapaEmpresas = useMemo(() => new Map(empresas.map((e) => [e.id, e.nome])), [empresas]);
  const filtradas = useMemo(
    () =>
      categorias.filter(
        (c) =>
          (empresaId === "todas" || c.empresaId === empresaId) &&
          normalizar(`${c.nome} ${mapaEmpresas.get(c.empresaId)}`).includes(normalizar(busca)),
      ),
    [categorias, empresaId, busca, mapaEmpresas],
  );
  const atualizar = () => queryClient.invalidateQueries({ queryKey: ["configuracao-auditoria"] });
  const salvarMut = useMutation({
    mutationFn: () => salvar({ data: nova }),
    onSuccess: () => {
      toast.success("Categoria salva.");
      setDialogNova(false);
      setNova({ empresaId: "", nome: "" });
      atualizar();
    },
    onError: (e) => toast.error(e.message),
  });
  const removerMut = useMutation({
    mutationFn: (id: string) => remover({ data: { id } }),
    onSuccess: () => {
      toast.success("Categoria removida.");
      atualizar();
    },
    onError: (e) => toast.error(e.message),
  });
  const importarMut = useMutation({
    mutationFn: async () => {
      let total = 0;
      const vinculadas = abas.filter((a) => a.empresaId);
      for (const aba of vinculadas) {
        for (let inicio = 0; inicio < aba.linhas.length; inicio += 500) {
          const resultado = await importar({
            data: {
              nomeArquivo: arquivo,
              abas: [{ ...aba, linhas: aba.linhas.slice(inicio, inicio + 500) }],
            },
          });
          total += resultado.total;
        }
      }
      return { total, empresas: new Set(vinculadas.map((a) => a.empresaId)).size };
    },
    onSuccess: (r) => {
      toast.success(`${r.total} categorias importadas para ${r.empresas} empresas.`);
      setDialogImportacao(false);
      setAbas([]);
      atualizar();
    },
    onError: (e) => toast.error(e.message),
  });

  async function lerArquivo(file: File) {
    if (painel.isLoading || painel.isError || empresas.length === 0) {
      toast.error(
        painel.isError
          ? "As empresas não foram carregadas. Verifique se a migration da configuração foi aplicada."
          : "Aguarde o carregamento das empresas antes de importar.",
      );
      if (inputArquivo.current) inputArquivo.current.value = "";
      return;
    }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const resultado = workbook.SheetNames.map((nome) => {
        const exata = empresas.find((e) => normalizar(e.nome) === normalizar(nome));
        const parcial =
          exata ??
          empresas.find(
            (e) =>
              normalizar(e.nome).includes(normalizar(nome)) ||
              normalizar(nome).includes(normalizar(e.nome)),
          );
        const linhas = XLSX.utils
          .sheet_to_json<Record<string, Celula>>(workbook.Sheets[nome]!, { defval: "", raw: false })
          .filter((l) => Object.values(l).some((v) => String(v).trim()));
        return { nome, empresaId: parcial?.id ?? null, linhas };
      });
      setArquivo(file.name);
      setAbas(resultado);
      setDialogImportacao(true);
    } catch {
      toast.error("Não foi possível ler a planilha. Use um arquivo .xlsx ou .xls válido.");
    }
    if (inputArquivo.current) inputArquivo.current.value = "";
  }

  return (
    <>
      <TopBar
        titulo="Configuração"
        descricao="Categorias e regras da auditoria financeira"
        mostrarContexto={false}
        acoes={
          <div className="flex gap-2">
            <input
              ref={inputArquivo}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void lerArquivo(e.target.files[0])}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={painel.isLoading || painel.isError || empresas.length === 0}
              onClick={() => inputArquivo.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Importar planilha
            </Button>
            <Button
              size="sm"
              disabled={painel.isLoading || painel.isError || empresas.length === 0}
              onClick={() => setDialogNova(true)}
            >
              <Plus className="h-4 w-4" />
              Nova categoria
            </Button>
          </div>
        }
      />
      <main className="space-y-5 p-6">
        {painel.isError && (
          <section className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <p className="font-semibold text-destructive">
              Não foi possível carregar a configuração da auditoria
            </p>
            <p className="mt-1 text-muted-foreground">
              A migration 20260916120000_add_auditoria_categorias.sql precisa estar aplicada no
              banco conectado a este ambiente. Depois de aplicá-la, recarregue esta página.
            </p>
            <Button className="mt-3" variant="outline" size="sm" onClick={() => painel.refetch()}>
              Tentar novamente
            </Button>
          </section>
        )}
        <section className="grid gap-3 md:grid-cols-3">
          <Resumo
            titulo="Empresas configuradas"
            valor={new Set(categorias.map((c) => c.empresaId)).size}
            icon={Building2}
          />
          <Resumo titulo="Categorias ativas" valor={categorias.length} icon={FileSpreadsheet} />
          <Resumo
            titulo="Importadas da planilha"
            valor={categorias.filter((c) => c.origem === "planilha").length}
            icon={Upload}
          />
        </section>
        <section className="rounded-lg border bg-card shadow-card">
          <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar categoria ou empresa"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <Select value={empresaId} onValueChange={setEmpresaId}>
              <SelectTrigger className="md:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as empresas</SelectItem>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-5">Categoria</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Dados adicionais</TableHead>
                <TableHead className="px-5 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.length ? (
                filtradas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="px-5 font-medium">{c.nome}</TableCell>
                    <TableCell>{mapaEmpresas.get(c.empresaId)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {c.origem === "planilha" ? (c.abaOrigem ?? "Planilha") : "Manual"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground">
                      {Object.entries(c.dados)
                        .filter(([k, v]) => normalizar(k) !== "categoria" && String(v).trim())
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ") || "—"}
                    </TableCell>
                    <TableCell className="px-5 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Visualizar categoria"
                        onClick={() => setCategoriaAberta(c)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Remover categoria"
                        onClick={() => removerMut.mutate(c.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    Nenhuma categoria encontrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </main>
      <Dialog open={dialogNova} onOpenChange={setDialogNova}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova categoria</DialogTitle>
            <DialogDescription>
              Inclua uma categoria manualmente para uma empresa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select
                value={nova.empresaId}
                onValueChange={(v) => setNova((n) => ({ ...n, empresaId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoria-nome">Categoria</Label>
              <Input
                id="categoria-nome"
                value={nova.nome}
                onChange={(e) => setNova((n) => ({ ...n, nome: e.target.value }))}
                placeholder="Nome da categoria"
              />
            </div>
            <Button
              className="w-full"
              disabled={salvarMut.isPending}
              onClick={() => salvarMut.mutate()}
            >
              {salvarMut.isPending ? "Salvando..." : "Salvar categoria"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={dialogImportacao} onOpenChange={setDialogImportacao}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conferir importação</DialogTitle>
            <DialogDescription>
              {arquivo}: confira a empresa identificada para cada aba antes de importar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {abas.map((aba, i) => (
              <div
                key={`${aba.nome}-${i}`}
                className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_1fr_auto] md:items-center"
              >
                <div>
                  <p className="font-medium">{aba.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {aba.linhas.length} linhas · categoria:{" "}
                    {aba.linhas[0] ? extrairNome(aba.linhas[0]) || "não identificada" : "aba vazia"}
                  </p>
                </div>
                <Select
                  value={aba.empresaId ?? "ignorar"}
                  onValueChange={(v) =>
                    setAbas((a) =>
                      a.map((x, j) =>
                        j === i ? { ...x, empresaId: v === "ignorar" ? null : v } : x,
                      ),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ignorar">Ignorar esta aba</SelectItem>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setAbas((a) => a.filter((_, j) => j !== i))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            className="w-full"
            disabled={importarMut.isPending || !abas.some((a) => a.empresaId)}
            onClick={() => importarMut.mutate()}
          >
            {importarMut.isPending
              ? "Importando..."
              : `Importar ${abas.reduce((s, a) => s + (a.empresaId ? a.linhas.length : 0), 0)} categorias`}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(categoriaAberta)}
        onOpenChange={(aberta) => !aberta && setCategoriaAberta(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{categoriaAberta?.nome}</DialogTitle>
            <DialogDescription>
              {categoriaAberta ? mapaEmpresas.get(categoriaAberta.empresaId) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {categoriaAberta &&
              Object.entries(categoriaAberta.dados)
                .filter(([, v]) => String(v).trim())
                .map(([chave, valor]) => (
                  <div
                    key={chave}
                    className="grid grid-cols-[minmax(120px,1fr)_2fr] gap-3 border-b py-2 text-sm"
                  >
                    <span className="font-medium">{chave}</span>
                    <span className="break-words text-muted-foreground">{String(valor)}</span>
                  </div>
                ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Resumo({
  titulo,
  valor,
  icon: Icon,
}: {
  titulo: string;
  valor: number;
  icon: typeof Building2;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{titulo}</p>
          <p className="mt-1 text-2xl font-semibold">{valor}</p>
        </div>
        <div className="rounded-lg bg-info-soft p-2.5 text-info">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
