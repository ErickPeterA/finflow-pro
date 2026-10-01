import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, createServerOnlyFn, useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  FileText,
  Paperclip,
  Plus,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { useApp } from "@/lib/app-context";
import { requireAuthenticatedUser } from "@/lib/auth-middleware";
import { brl, dataBR } from "@/lib/format";

const servidor = createServerOnlyFn(async () => {
  const [{ query, withTransaction }, { assertEmpresaAccess }] = await Promise.all([
    import("@/lib/postgres"),
    import("@/lib/authorization"),
  ]);
  return { query, withTransaction, assertEmpresaAccess };
});
type Anexo = { id: string; nome: string; tipo: string; tamanho: number };
type Status = "em_analise" | "programada" | "paga" | "rejeitada" | "aguardando_ajuste";
type Solicitacao = {
  id: string;
  cliente: string;
  cpf_cnpj: string | null;
  categoria_trabalho: string;
  descricao_trabalho: string;
  prospeccao: string | null;
  honorarios: string | null;
  vencimento_pagamento: string | null;
  contato_financeiro: string | null;
  observacoes: string | null;
  valor: number | null;
  status: Status;
  created_at: string;
  solicitante: string;
  anexos: Anexo[];
};
const listar = createServerFn({ method: "GET" })
  .middleware([requireAuthenticatedUser])
  .validator((d: { empresaId: string }) => d)
  .handler(async ({ context, data }) => {
    const { query, assertEmpresaAccess } = await servidor();
    await assertEmpresaAccess(String(context.userId), data.empresaId);
    return (
      await query<Solicitacao>(
        "select s.*,coalesce(nullif(p.nome,''),u.nome,u.email,'Usuário') as solicitante,coalesce((select json_agg(json_build_object('id',a.id,'nome',a.nome_arquivo,'tipo',a.tipo_mime,'tamanho',a.tamanho_bytes) order by a.created_at) from solicitacao_pagamento_anexos a where a.solicitacao_id=s.id),'[]'::json) as anexos from solicitacoes_pagamento s join users u on u.id=s.solicitante_id left join profiles p on p.id=u.id where s.empresa_id=$1::uuid order by s.created_at desc",
        [data.empresaId],
      )
    ).rows;
  });
const criar = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator(
    (d: {
      empresaId: string;
      cliente: string;
      cpfCnpj: string;
      categoria: string;
      descricao: string;
      prospeccao: string;
      honorarios: string;
      vencimento: string;
      contato: string;
      observacoes: string;
      valor: string;
      anexos: Array<{ nome: string; tipo: string; tamanho: number; base64: string }>;
    }) => {
      if (!d.cliente.trim() || !d.categoria.trim() || !d.descricao.trim())
        throw new Error("Preencha cliente, categoria de trabalho e descrição.");
      if (d.anexos.length > 5) throw new Error("Envie no máximo 5 anexos.");
      return d;
    },
  )
  .handler(async ({ context, data }) => {
    const { withTransaction, assertEmpresaAccess } = await servidor();
    await assertEmpresaAccess(String(context.userId), data.empresaId);
    await withTransaction(async (client) => {
      const solicitacao = await client.query<{ id: string }>(
        "insert into solicitacoes_pagamento (empresa_id,solicitante_id,cliente,cpf_cnpj,categoria_trabalho,descricao_trabalho,prospeccao,honorarios,vencimento_pagamento,contato_financeiro,observacoes,valor) values ($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id",
        [
          data.empresaId,
          String(context.userId),
          data.cliente.trim(),
          data.cpfCnpj.trim() || null,
          data.categoria.trim(),
          data.descricao.trim(),
          data.prospeccao.trim() || null,
          data.honorarios.trim() || null,
          data.vencimento.trim() || null,
          data.contato.trim() || null,
          data.observacoes.trim() || null,
          data.valor ? Number(data.valor.replace(",", ".")) : null,
        ],
      );
      for (const anexo of data.anexos) {
        const extensao = anexo.nome.split(".").pop()?.toLowerCase() ?? "";
        if (!extensoesPermitidas.has(extensao))
          throw new Error(`O tipo do arquivo ${anexo.nome} não é permitido.`);
        const conteudo = Buffer.from(anexo.base64, "base64");
        if (
          !conteudo.length ||
          conteudo.length > 8 * 1024 * 1024 ||
          conteudo.length !== anexo.tamanho
        )
          throw new Error(`O arquivo ${anexo.nome} é inválido ou excede 8 MB.`);
        await client.query(
          "insert into solicitacao_pagamento_anexos (solicitacao_id,empresa_id,nome_arquivo,tipo_mime,tamanho_bytes,conteudo,created_by) values ($1,$2,$3,$4,$5,$6,$7)",
          [
            solicitacao.rows[0]!.id,
            data.empresaId,
            anexo.nome.slice(0, 240),
            anexo.tipo.slice(0, 120) || "application/octet-stream",
            conteudo.length,
            conteudo,
            String(context.userId),
          ],
        );
      }
    });
    return { ok: true };
  });

const baixarAnexo = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((d: { empresaId: string; anexoId: string }) => d)
  .handler(async ({ context, data }) => {
    const { query, assertEmpresaAccess } = await servidor();
    await assertEmpresaAccess(String(context.userId), data.empresaId);
    const resultado = await query<{ nome_arquivo: string; tipo_mime: string; conteudo: Buffer }>(
      "select nome_arquivo,tipo_mime,conteudo from solicitacao_pagamento_anexos where id=$1::uuid and empresa_id=$2::uuid",
      [data.anexoId, data.empresaId],
    );
    const anexo = resultado.rows[0];
    if (!anexo) throw new Error("Anexo não encontrado.");
    return {
      nome: anexo.nome_arquivo,
      tipo: anexo.tipo_mime,
      base64: anexo.conteudo.toString("base64"),
    };
  });

export const Route = createFileRoute("/_authenticated/solicitacoes-pagamento")({
  component: Pagina,
});
const vazio = {
  cliente: "",
  cpfCnpj: "",
  categoria: "PJ - Êxito",
  descricao: "",
  prospeccao: "",
  honorarios: "",
  vencimento: "",
  contato: "",
  observacoes: "",
  valor: "",
};
const camposPrincipais: Array<[keyof typeof vazio, string]> = [
  ["cliente", "Cliente*"],
  ["cpfCnpj", "CPF/CNPJ"],
  ["categoria", "Categoria de trabalho*"],
  ["valor", "Valor estimado"],
];
const rotulo: Record<Status, string> = {
  em_analise: "Em análise",
  programada: "Programada",
  paga: "Paga",
  rejeitada: "Rejeitada",
  aguardando_ajuste: "Aguardando ajuste",
};
function Pagina() {
  const { empresaId } = useApp();
  const qc = useQueryClient();
  const listarFn = useServerFn(listar);
  const criarFn = useServerFn(criar);
  const baixarAnexoFn = useServerFn(baixarAnexo);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"todos" | Status>("todos");
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState(vazio);
  const [anexos, setAnexos] = useState<File[]>([]);
  const dados = useQuery({
    queryKey: ["solicitacoes-pagamento", empresaId],
    queryFn: () => listarFn({ data: { empresaId: empresaId! } }),
    enabled: !!empresaId,
  });
  const salvar = useMutation({
    mutationFn: async () =>
      criarFn({
        data: {
          empresaId: empresaId!,
          ...form,
          anexos: await Promise.all(anexos.map(arquivoParaEnvio)),
        },
      }),
    onSuccess: () => {
      toast.success("Solicitação enviada para análise.");
      setForm(vazio);
      setAnexos([]);
      setAberto(false);
      qc.invalidateQueries({ queryKey: ["solicitacoes-pagamento", empresaId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao enviar."),
  });
  const itens = (dados.data ?? []).filter(
    (x) =>
      (status === "todos" || x.status === status) &&
      `${x.cliente} ${x.descricao_trabalho}`.toLowerCase().includes(q.toLowerCase()),
  );
  function selecionarAnexos(lista: File[]) {
    const permitidos = lista.filter(arquivoPermitido);
    const combinados = [...anexos, ...permitidos].slice(0, 5);
    if (permitidos.length !== lista.length)
      toast.error("Use PDF, imagens, Word, Excel, CSV ou TXT, com até 8 MB por arquivo.");
    if (anexos.length + permitidos.length > 5) toast.error("O limite é de 5 anexos.");
    setAnexos(combinados);
  }
  async function baixar(anexo: Anexo) {
    try {
      const arquivo = await baixarAnexoFn({ data: { empresaId: empresaId!, anexoId: anexo.id } });
      const bytes = Uint8Array.from(atob(arquivo.base64), (caractere) => caractere.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: arquivo.tipo }));
      const link = document.createElement("a");
      link.href = url;
      link.download = arquivo.nome;
      link.click();
      URL.revokeObjectURL(url);
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível baixar o anexo.");
    }
  }
  const totais = useMemo(
    () =>
      Object.fromEntries(
        (["em_analise", "programada", "paga", "rejeitada"] as Status[]).map((s) => [
          s,
          (dados.data ?? []).filter((x) => x.status === s).length,
        ]),
      ),
    [dados.data],
  );
  return (
    <>
      <TopBar
        titulo="Solicitações de Pagamento"
        descricao="Envie e acompanhe pedidos de pagamento do projeto"
        mostrarFiltrosData={false}
        acoes={
          <Button size="sm" onClick={() => setAberto(true)}>
            <Plus className="h-4 w-4" />
            Nova solicitação
          </Button>
        }
      />
      <main className="space-y-5 p-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi titulo="Em análise" valor={totais["em_analise"] ?? 0} icon={Clock3} />
          <Kpi titulo="Programadas" valor={totais["programada"] ?? 0} icon={ClipboardList} />
          <Kpi titulo="Pagas" valor={totais["paga"] ?? 0} icon={CheckCircle2} />
          <Kpi titulo="Rejeitadas" valor={totais["rejeitada"] ?? 0} icon={XCircle} />
        </section>
        <section className="rounded-xl border bg-card shadow-card">
          <div className="flex flex-wrap gap-3 border-b p-4">
            <div className="relative min-w-60 flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar cliente ou descrição"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {Object.entries(rotulo).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Solicitada em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Solicitante</TableHead>
                <TableHead>Anexos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.cliente}</TableCell>
                  <TableCell className="max-w-80 truncate">{i.descricao_trabalho}</TableCell>
                  <TableCell>{i.categoria_trabalho}</TableCell>
                  <TableCell>{i.valor == null ? "—" : brl(i.valor)}</TableCell>
                  <TableCell>{dataBR(i.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant={i.status === "rejeitada" ? "destructive" : "secondary"}>
                      {rotulo[i.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{i.solicitante}</TableCell>
                  <TableCell>
                    {i.anexos.length ? (
                      <div className="flex max-w-52 flex-wrap gap-1">
                        {i.anexos.map((anexo) => (
                          <Button
                            key={anexo.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 max-w-44 gap-1 px-2 text-xs"
                            title={`${anexo.nome} (${formatarTamanho(anexo.tamanho)})`}
                            onClick={() => void baixar(anexo)}
                          >
                            <Download className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{anexo.nome}</span>
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!itens.length && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    Nenhuma solicitação encontrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      </main>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova solicitação de pagamento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {camposPrincipais.map(([k, l]) => (
              <Campo
                key={k}
                label={l}
                value={form[k]}
                onChange={(v) => setForm((f) => ({ ...f, [k]: v }))}
              />
            ))}
            <div className="sm:col-span-2">
              <Campo
                label="Descrição do trabalho*"
                value={form.descricao}
                onChange={(v) => setForm((f) => ({ ...f, descricao: v }))}
                longo
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Anexos</Label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 px-4 py-5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/40 hover:text-foreground">
                <Paperclip className="h-4 w-4" />
                Anexar comprovante, boleto ou documento
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  onChange={(e) => {
                    selecionarAnexos(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Até 5 arquivos, com no máximo 8 MB cada.
              </p>
              {anexos.map((arquivo, indice) => (
                <div
                  key={`${arquivo.name}-${indice}`}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{arquivo.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatarTamanho(arquivo.size)}
                  </span>
                  <button
                    type="button"
                    className="rounded p-1 hover:bg-muted"
                    onClick={() => setAnexos((atuais) => atuais.filter((_, i) => i !== indice))}
                    aria-label={`Remover ${arquivo.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <Campo
              label="Prospecção"
              value={form.prospeccao}
              onChange={(v) => setForm((f) => ({ ...f, prospeccao: v }))}
            />
            <Campo
              label="Honorários"
              value={form.honorarios}
              onChange={(v) => setForm((f) => ({ ...f, honorarios: v }))}
            />
            <div className="sm:col-span-2">
              <Campo
                label="Vencimento, prazo e forma de pagamento"
                value={form.vencimento}
                onChange={(v) => setForm((f) => ({ ...f, vencimento: v }))}
                longo
              />
            </div>
            <Campo
              label="Contato financeiro"
              value={form.contato}
              onChange={(v) => setForm((f) => ({ ...f, contato: v }))}
            />
            <div className="sm:col-span-2">
              <Campo
                label="Observações"
                value={form.observacoes}
                onChange={(v) => setForm((f) => ({ ...f, observacoes: v }))}
                longo
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              {salvar.isPending ? "Enviando..." : "Enviar solicitação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
function Campo({
  label,
  value,
  onChange,
  longo,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  longo?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {longo ? (
        <textarea
          className="min-h-22 w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

const extensoesPermitidas = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
]);

function arquivoPermitido(arquivo: File) {
  const extensao = arquivo.name.split(".").pop()?.toLowerCase() ?? "";
  return arquivo.size > 0 && arquivo.size <= 8 * 1024 * 1024 && extensoesPermitidas.has(extensao);
}

function arquivoParaEnvio(arquivo: File) {
  return new Promise<{ nome: string; tipo: string; tamanho: number; base64: string }>(
    (resolve, reject) => {
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error(`Não foi possível ler ${arquivo.name}.`));
      leitor.onload = () =>
        resolve({
          nome: arquivo.name,
          tipo: arquivo.type || "application/octet-stream",
          tamanho: arquivo.size,
          base64: String(leitor.result ?? "").split(",")[1] ?? "",
        });
      leitor.readAsDataURL(arquivo);
    },
  );
}

function formatarTamanho(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function Kpi({
  titulo,
  valor,
  icon: Icon,
}: {
  titulo: string;
  valor: number;
  icon: typeof Clock3;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-card">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 text-2xl font-semibold">{valor}</p>
      <p className="text-sm text-muted-foreground">{titulo}</p>
    </section>
  );
}
