import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, createServerOnlyFn, useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, KeyRound, Link2, Pencil, RefreshCw, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const carregarServidor = createServerOnlyFn(async () => {
  const [auth, postgres] = await Promise.all([
    import("@/lib/auth.server"),
    import("@/lib/postgres"),
  ]);
  return { hashPassword: auth.hashPassword, ...postgres };
});

type PerfilProjeto = "interno" | "externo";
type AbaGerenciamento = "criar-login" | "gerenciar-usuarios" | "atrelar-usuarios";

interface UsuarioGerenciado {
  id: string;
  email: string;
  nome: string;
  ativo: boolean;
  criadoEm: string | null;
  ultimoAcesso: string | null;
}

interface ProjetoGerenciado {
  id: string;
  nome: string;
  cnpj: string | null;
  ativo: boolean;
}

const perfilLabels: Record<PerfilProjeto, string> = {
  interno: "Interno",
  externo: "Externo",
};

const abasGerenciamento: AbaGerenciamento[] = [
  "criar-login",
  "gerenciar-usuarios",
  "atrelar-usuarios",
];

export const Route = createFileRoute("/_authenticated/gerenciamento")({
  validateSearch: (search: Record<string, unknown>) => ({
    aba: abasGerenciamento.includes(search["aba"] as AbaGerenciamento)
      ? (search["aba"] as AbaGerenciamento)
      : "criar-login",
  }),
  head: () => ({
    meta: [
      { title: "Gerenciamento | VG Finance" },
      {
        name: "description",
        content: "Gerencie logins, usuários e vínculos com projetos.",
      },
    ],
  }),
  component: GerenciamentoPage,
});

async function exigirAdmin(userId: string) {
  const { query } = await carregarServidor();
  const result = await query("select 1 from user_roles where user_id=$1::uuid and role='admin'", [userId]);
  if (!result.rowCount) throw new Error("Acesso restrito a administradores.");
}

function criarEmailAutenticacao(valor: string) {
  const entrada = valor.trim().toLowerCase();
  if (!entrada || !entrada.includes("@")) return null;

  const partes = entrada.split("@");
  if (partes.length !== 2) return null;

  const [nomeUsuario, dominioUsuario] = partes;
  if (!nomeUsuario || !dominioUsuario) return null;

  const usuario = nomeUsuario
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/[._-]{2,}/g, "-");
  const dominio = dominioUsuario
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/[.-]{2,}/g, "-");

  if (!usuario || !dominio) return null;

  return `${usuario}@${dominio.includes(".") ? dominio : `${dominio}.local`}`;
}

async function montarPainel(adminId: string) {
  await exigirAdmin(adminId);
  const { query } = await carregarServidor();

  const [usuariosResult, projetosResult, vinculosResult] = await Promise.all([
    query<UsuarioGerenciado>(`select u.id,coalesce(u.email,'sem e-mail') as email,coalesce(nullif(p.nome,''),nullif(u.nome,''),split_part(u.email,'@',1),'Usuário') as nome,u.ativo,u.created_at as "criadoEm",(select max(s.created_at) from auth_sessions s where s.user_id=u.id) as "ultimoAcesso" from users u left join profiles p on p.id=u.id order by nome`),
    query<ProjetoGerenciado>("select id,nome,cnpj,ativo from empresas order by nome"),
    query<{id:string;empresa_id:string;user_id:string;perfil:PerfilProjeto;ativo:boolean;created_at:string}>("select id,empresa_id,user_id,perfil,ativo,created_at from projeto_usuarios order by created_at desc"),
  ]);
  const usuarios=usuariosResult.rows, projetos=projetosResult.rows, vinculos=vinculosResult.rows;

  return {
    usuarios,
    projetos: (projetos ?? []) as ProjetoGerenciado[],
    vinculos: (vinculos ?? []).map((v) => ({
      id: v.id,
      userId: v.user_id,
      empresaId: v.empresa_id,
      perfil: v.perfil as PerfilProjeto,
      ativo: v.ativo,
      criadoEm: v.created_at,
    })),
    usuarioAtualId: adminId,
  };
}

type PainelAdmin = Awaited<ReturnType<typeof montarPainel>>;

const usuariosVazios: PainelAdmin["usuarios"] = [];
const projetosVazios: PainelAdmin["projetos"] = [];
const vinculosVazios: PainelAdmin["vinculos"] = [];

const listarPainel = createServerFn({ method: "GET" })
  .middleware([requireAuthenticatedUser])
  .handler(async ({ context }) => montarPainel(String(context.userId)));

const criarLogin = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((data: { nome: string; email: string; senha: string }) => {
    const nome = data.nome.trim();
    const email = criarEmailAutenticacao(data.email);
    const senha = data.senha.trim();

    if (!nome) throw new Error("Informe o nome do usuário.");
    if (!email) throw new Error("Informe um e-mail fictício com @, como erick@vg.");
    if (senha.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");

    return { nome: nome.slice(0, 160), email, senha };
  })
  .handler(async ({ context, data }) => {
    await exigirAdmin(String(context.userId));
    const { hashPassword, withTransaction } = await carregarServidor();
    const passwordHash = await hashPassword(data.senha);
    try {
      await withTransaction(async (client) => {
        const user = await client.query<{ id: string }>("insert into users (email,nome,password_hash,password_changed_at) values ($1,$2,$3,now()) returning id", [data.email,data.nome,passwordHash]);
        const userId = user.rows[0]!.id;
        await client.query("insert into profiles (id,nome,email) values ($1,$2,$3)", [userId,data.nome,data.email]);
        await client.query("insert into user_roles (user_id,role) values ($1,'consultor')", [userId]);
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new Error("Já existe um login com esse e-mail.");
      throw error;
    }

    return { ok: true };
  });

const alterarStatusUsuario = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((data: { userId: string; ativo: boolean }) => {
    if (!data.userId) throw new Error("Usuário inválido.");
    return data;
  })
  .handler(async ({ context, data }) => {
    const adminId = String(context.userId);
    await exigirAdmin(adminId);
    const { withTransaction } = await carregarServidor();

    if (data.userId === adminId && !data.ativo) {
      throw new Error("Você não pode desativar o próprio usuário.");
    }

    await withTransaction(async (client) => {
      const result = await client.query("update users set ativo=$1 where id=$2::uuid", [data.ativo,data.userId]);
      if (!result.rowCount) throw new Error("Usuário não encontrado.");
      if (!data.ativo) await client.query("update auth_sessions set revoked_at=now() where user_id=$1::uuid and revoked_at is null", [data.userId]);
    });

    return { ok: true };
  });

const editarUsuario = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((data: { userId: string; nome: string; email: string }) => {
    const nome = data.nome.trim();
    const email = criarEmailAutenticacao(data.email);
    if (!data.userId) throw new Error("Usuário inválido.");
    if (!nome) throw new Error("Informe o nome do usuário.");
    if (!email) throw new Error("Informe um e-mail válido.");
    return { userId: data.userId, nome: nome.slice(0, 160), email };
  })
  .handler(async ({ context, data }) => {
    await exigirAdmin(String(context.userId));
    const { withTransaction } = await carregarServidor();
    try {
      await withTransaction(async (client) => {
        const anterior = await client.query<{ email: string | null }>("select email from users where id=$1::uuid for update", [data.userId]);
        if (!anterior.rowCount) throw new Error("Usuário não encontrado.");
        await client.query("update users set nome=$1,email=$2 where id=$3::uuid", [data.nome,data.email,data.userId]);
        await client.query("insert into profiles (id,nome,email) values ($1,$2,$3) on conflict (id) do update set nome=excluded.nome,email=excluded.email", [data.userId,data.nome,data.email]);
        if (anterior.rows[0]!.email?.toLowerCase() !== data.email) {
          await client.query("update auth_sessions set revoked_at=now() where user_id=$1::uuid and revoked_at is null", [data.userId]);
        }
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new Error("Já existe um login com esse e-mail.");
      throw error;
    }
    return { ok: true };
  });

const redefinirSenhaUsuario = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((data: { userId: string; senha: string }) => {
    if (!data.userId) throw new Error("Usuário inválido.");
    if (data.senha.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
    return data;
  })
  .handler(async ({ context, data }) => {
    await exigirAdmin(String(context.userId));
    const { hashPassword, withTransaction } = await carregarServidor();
    const passwordHash = await hashPassword(data.senha);
    await withTransaction(async (client) => {
      const result = await client.query("update users set password_hash=$1,password_changed_at=now() where id=$2::uuid", [passwordHash,data.userId]);
      if (!result.rowCount) throw new Error("Usuário não encontrado.");
      await client.query("update auth_sessions set revoked_at=now() where user_id=$1::uuid and revoked_at is null", [data.userId]);
    });
    return { ok: true };
  });

const excluirUsuario = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((data: { userId: string }) => {
    if (!data.userId) throw new Error("Usuário inválido.");
    return data;
  })
  .handler(async ({ context, data }) => {
    const adminId = String(context.userId);
    await exigirAdmin(adminId);
    const { query } = await carregarServidor();
    if (data.userId === adminId) throw new Error("Você não pode excluir o próprio usuário.");
    const result = await query("delete from users where id=$1::uuid", [data.userId]);
    if (!result.rowCount) throw new Error("Usuário não encontrado.");
    return { ok: true };
  });

const salvarVinculo = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((data: { userId: string; empresaId: string; perfil: PerfilProjeto }) => {
    if (!data.userId) throw new Error("Selecione um usuário.");
    if (!data.empresaId) throw new Error("Selecione um projeto.");
    if (data.perfil !== "interno" && data.perfil !== "externo") {
      throw new Error("Selecione um perfil válido.");
    }

    return {
      userId: data.userId,
      empresaId: data.empresaId,
      perfil: data.perfil,
    };
  })
  .handler(async ({ context, data }) => {
    const adminId = String(context.userId);
    await exigirAdmin(adminId);
    const { query } = await carregarServidor();

    const { rows: projeto } = await query("select id from empresas where id=$1::uuid", [data.empresaId]);
    if (!projeto.length) throw new Error("Projeto não encontrado.");
    if (!projeto) throw new Error("Projeto não encontrado.");

    await query("insert into projeto_usuarios (user_id,empresa_id,perfil,ativo,created_by) values ($1,$2,$3,true,$4) on conflict (empresa_id,user_id) do update set perfil=excluded.perfil,ativo=true,created_by=excluded.created_by", [data.userId,data.empresaId,data.perfil,adminId]);

    return { ok: true };
  });

const desativarVinculo = createServerFn({ method: "POST" })
  .middleware([requireAuthenticatedUser])
  .validator((data: { vinculoId: string }) => {
    if (!data.vinculoId) throw new Error("Vínculo inválido.");
    return data;
  })
  .handler(async ({ context, data }) => {
    const adminId = String(context.userId);
    await exigirAdmin(adminId);
    const { query } = await carregarServidor();

    await query("update projeto_usuarios set ativo=false where id=$1::uuid", [data.vinculoId]);

    return { ok: true };
  });

function GerenciamentoPage() {
  const { aba } = Route.useSearch();
  const queryClient = useQueryClient();
  const listarPainelFn = useServerFn(listarPainel);
  const criarLoginFn = useServerFn(criarLogin);
  const alterarStatusFn = useServerFn(alterarStatusUsuario);
  const editarUsuarioFn = useServerFn(editarUsuario);
  const redefinirSenhaFn = useServerFn(redefinirSenhaUsuario);
  const excluirUsuarioFn = useServerFn(excluirUsuario);
  const salvarVinculoFn = useServerFn(salvarVinculo);
  const desativarVinculoFn = useServerFn(desativarVinculo);

  const [novoLogin, setNovoLogin] = useState({ nome: "", email: "", senha: "" });
  const [edicao, setEdicao] = useState({ userId: "", nome: "", email: "", senha: "" });
  const [novoVinculo, setNovoVinculo] = useState<{
    userId: string;
    empresaId: string;
    perfil: PerfilProjeto;
  }>({
    userId: "",
    empresaId: "",
    perfil: "interno",
  });

  const painelQuery = useQuery({
    queryKey: ["gerenciamento-painel"],
    queryFn: () => listarPainelFn(),
  });

  const invalidarPainel = () => {
    queryClient.invalidateQueries({ queryKey: ["gerenciamento-painel"] });
    queryClient.invalidateQueries({ queryKey: ["empresas"] });
    queryClient.invalidateQueries({ queryKey: ["meu-cargo"] });
    queryClient.invalidateQueries({ queryKey: ["perfil-projeto-atual"] });
  };

  const criarLoginMutation = useMutation({
    mutationFn: () => criarLoginFn({ data: novoLogin }),
    onSuccess: () => {
      toast.success("Login criado.");
      setNovoLogin({ nome: "", email: "", senha: "" });
      invalidarPainel();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao criar login."),
  });

  const alterarStatus = useMutation({
    mutationFn: (data: { userId: string; ativo: boolean }) => alterarStatusFn({ data }),
    onSuccess: (_, data) => {
      toast.success(data.ativo ? "Usuário reativado." : "Usuário desativado.");
      invalidarPainel();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar usuário."),
  });

  const salvarEdicao = useMutation({
    mutationFn: () => editarUsuarioFn({ data: { userId: edicao.userId, nome: edicao.nome, email: edicao.email } }),
    onSuccess: () => {
      toast.success("Usuário atualizado.");
      setEdicao({ userId: "", nome: "", email: "", senha: "" });
      invalidarPainel();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao editar usuário."),
  });

  const redefinirSenha = useMutation({
    mutationFn: () => redefinirSenhaFn({ data: { userId: edicao.userId, senha: edicao.senha } }),
    onSuccess: () => {
      toast.success("Senha redefinida e sessões revogadas.");
      setEdicao((v) => ({ ...v, senha: "" }));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao redefinir senha."),
  });

  const excluir = useMutation({
    mutationFn: (userId: string) => excluirUsuarioFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Usuário excluído.");
      setEdicao({ userId: "", nome: "", email: "", senha: "" });
      invalidarPainel();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao excluir usuário."),
  });

  const atrelarUsuario = useMutation({
    mutationFn: () => salvarVinculoFn({ data: novoVinculo }),
    onSuccess: () => {
      toast.success("Usuário atrelado ao projeto.");
      setNovoVinculo({ userId: "", empresaId: "", perfil: "interno" });
      invalidarPainel();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atrelar usuário."),
  });

  const removerVinculo = useMutation({
    mutationFn: (vinculoId: string) => desativarVinculoFn({ data: { vinculoId } }),
    onSuccess: () => {
      toast.success("Vínculo desativado.");
      invalidarPainel();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao desativar vínculo."),
  });

  const usuarios = painelQuery.data?.usuarios ?? usuariosVazios;
  const projetos = painelQuery.data?.projetos ?? projetosVazios;
  const vinculos = painelQuery.data?.vinculos ?? vinculosVazios;
  const usuarioAtualId = painelQuery.data?.usuarioAtualId;

  const usuariosPorId = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios]);
  const projetosPorId = useMemo(() => new Map(projetos.map((p) => [p.id, p])), [projetos]);

  return (
    <>
      <TopBar
        titulo="Gerenciamento"
        descricao="Crie logins, desative acessos e vincule usuários aos projetos"
        mostrarContexto={false}
      />

      <main className="space-y-5 p-6">
        <div className="space-y-5">
          {painelQuery.isError && (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm font-medium">Acesso indisponível</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {painelQuery.error instanceof Error
                  ? painelQuery.error.message
                  : "Não foi possível carregar o gerenciamento."}
              </p>
            </div>
          )}

          {aba === "criar-login" && (
            <section className="max-w-xl rounded-lg border bg-card p-5 shadow-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info-soft text-info">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Novo login</h2>
                  <p className="text-xs text-muted-foreground">
                    O acesso será criado já confirmado e pronto para entrar.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="novo-nome">Nome</Label>
                  <Input
                    id="novo-nome"
                    value={novoLogin.nome}
                    onChange={(e) => setNovoLogin((v) => ({ ...v, nome: e.target.value }))}
                    placeholder="Nome completo"
                    maxLength={160}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="novo-email">Gmail</Label>
                  <Input
                    id="novo-email"
                    value={novoLogin.email}
                    onChange={(e) => setNovoLogin((v) => ({ ...v, email: e.target.value }))}
                    placeholder="usuario@vg ou usuario@gmail"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="novo-senha">Senha</Label>
                  <Input
                    id="novo-senha"
                    type="password"
                    value={novoLogin.senha}
                    onChange={(e) => setNovoLogin((v) => ({ ...v, senha: e.target.value }))}
                    placeholder="Mínimo de 8 caracteres"
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
                <Button
                  onClick={() => criarLoginMutation.mutate()}
                  disabled={criarLoginMutation.isPending}
                >
                  <UserPlus className="h-4 w-4" />
                  {criarLoginMutation.isPending ? "Criando..." : "Criar login"}
                </Button>
              </div>
            </section>
          )}

          {aba === "gerenciar-usuarios" && (
            <section className="rounded-lg border bg-card shadow-card">
              {edicao.userId && (
                <div className="grid gap-3 border-b bg-muted/20 p-5 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="editar-nome">Nome</Label>
                    <Input id="editar-nome" value={edicao.nome} maxLength={160} onChange={(e) => setEdicao((v) => ({ ...v, nome: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="editar-email">E-mail</Label>
                    <Input id="editar-email" value={edicao.email} onChange={(e) => setEdicao((v) => ({ ...v, email: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-senha">Nova senha</Label>
                    <Input id="reset-senha" type="password" minLength={8} placeholder="Mínimo de 8 caracteres" autoComplete="new-password" value={edicao.senha} onChange={(e) => setEdicao((v) => ({ ...v, senha: e.target.value }))} />
                  </div>
                  <div className="flex flex-wrap gap-2 md:col-span-3">
                    <Button size="sm" onClick={() => salvarEdicao.mutate()} disabled={salvarEdicao.isPending}>Salvar dados</Button>
                    <Button size="sm" variant="outline" onClick={() => redefinirSenha.mutate()} disabled={redefinirSenha.isPending || edicao.senha.length < 8}><KeyRound className="h-4 w-4" />Redefinir senha</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEdicao({ userId: "", nome: "", email: "", senha: "" })}>Cancelar</Button>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
                <div>
                  <h2 className="text-sm font-semibold">Usuários cadastrados</h2>
                  <p className="text-xs text-muted-foreground">
                    Desativar usuário bloqueia o acesso ao sistema.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => painelQuery.refetch()}
                  disabled={painelQuery.isFetching}
                >
                  <RefreshCw className="h-4 w-4" />
                  {painelQuery.isFetching ? "Atualizando" : "Atualizar"}
                </Button>
              </div>

              {painelQuery.isLoading ? (
                <div className="p-5">
                  <div className="h-40 rounded-lg border bg-muted/40" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-5">Usuário</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Projetos ativos</TableHead>
                      <TableHead>Último acesso</TableHead>
                      <TableHead className="px-5 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usuarios.map((usuario) => {
                      const projetosAtivos = vinculos.filter(
                        (v) => v.userId === usuario.id && v.ativo,
                      ).length;

                      return (
                        <TableRow key={usuario.id}>
                          <TableCell className="px-5">
                            <p className="font-medium">
                              {usuario.nome}
                              {usuario.id === usuarioAtualId && (
                                <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">{usuario.email}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant={usuario.ativo ? "secondary" : "destructive"}>
                              {usuario.ativo ? "Ativo" : "Desativado"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{projetosAtivos}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatarData(usuario.ultimoAcesso)}
                          </TableCell>
                          <TableCell className="px-5 text-right">
                            <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setEdicao({ userId: usuario.id, nome: usuario.nome, email: usuario.email, senha: "" })}>
                              <Pencil className="h-4 w-4" />Editar
                            </Button>
                            <Button
                              variant={usuario.ativo ? "destructive" : "outline"}
                              size="sm"
                              disabled={alterarStatus.isPending || usuario.id === usuarioAtualId}
                              onClick={() =>
                                alterarStatus.mutate({
                                  userId: usuario.id,
                                  ativo: !usuario.ativo,
                                })
                              }
                            >
                              <UserMinus className="h-4 w-4" />
                              {usuario.ativo ? "Desativar" : "Reativar"}
                            </Button>
                            <Button variant="outline" size="sm" disabled={excluir.isPending || usuario.id === usuarioAtualId} onClick={() => { if (window.confirm(`Excluir definitivamente ${usuario.nome}?`)) excluir.mutate(usuario.id); }}>
                              <Trash2 className="h-4 w-4" />Excluir
                            </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </section>
          )}

          {aba === "atrelar-usuarios" && (
            <div className="grid gap-5 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
              <section className="rounded-lg border bg-card p-5 shadow-card">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info-soft text-info">
                    <Link2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">Atrelar usuário</h2>
                    <p className="text-xs text-muted-foreground">
                      Selecione um usuário, projeto e perfil.
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label>Usuário</Label>
                    <Select
                      value={novoVinculo.userId}
                      onValueChange={(userId) => setNovoVinculo((v) => ({ ...v, userId }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {usuarios
                          .filter((u) => u.ativo)
                          .map((usuario) => (
                            <SelectItem key={usuario.id} value={usuario.id}>
                              {usuario.nome}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Projeto</Label>
                    <Select
                      value={novoVinculo.empresaId}
                      onValueChange={(empresaId) => setNovoVinculo((v) => ({ ...v, empresaId }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {projetos.map((projeto) => (
                          <SelectItem key={projeto.id} value={projeto.id}>
                            {projeto.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Perfil</Label>
                    <Select
                      value={novoVinculo.perfil}
                      onValueChange={(perfil) =>
                        setNovoVinculo((v) => ({ ...v, perfil: perfil as PerfilProjeto }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="interno">Interno</SelectItem>
                        <SelectItem value="externo">Externo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => atrelarUsuario.mutate()}
                    disabled={atrelarUsuario.isPending || projetos.length === 0}
                  >
                    <Building2 className="h-4 w-4" />
                    {atrelarUsuario.isPending ? "Atrelando..." : "Atrelar ao projeto"}
                  </Button>
                </div>
              </section>

              <section className="rounded-lg border bg-card shadow-card">
                <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
                  <div>
                    <h2 className="text-sm font-semibold">Vínculos existentes</h2>
                    <p className="text-xs text-muted-foreground">
                      Usuários só enxergam projetos com vínculo ativo.
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{vinculos.length} no total</span>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-5">Usuário</TableHead>
                      <TableHead>Projeto</TableHead>
                      <TableHead>Perfil</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="px-5 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vinculos.length === 0 ? (
                      <TableRow>
                        <TableCell className="px-5 text-muted-foreground" colSpan={5}>
                          Nenhum vínculo criado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      vinculos.map((vinculo) => {
                        const usuario = usuariosPorId.get(vinculo.userId);
                        const projeto = projetosPorId.get(vinculo.empresaId);

                        return (
                          <TableRow key={vinculo.id}>
                            <TableCell className="px-5">
                              <p className="font-medium">{usuario?.nome ?? "Usuário removido"}</p>
                              <p className="text-xs text-muted-foreground">{usuario?.email}</p>
                            </TableCell>
                            <TableCell>{projeto?.nome ?? "Projeto removido"}</TableCell>
                            <TableCell>{perfilLabels[vinculo.perfil]}</TableCell>
                            <TableCell>
                              <Badge variant={vinculo.ativo ? "secondary" : "outline"}>
                                {vinculo.ativo ? "Ativo" : "Desativado"}
                              </Badge>
                            </TableCell>
                            <TableCell className="px-5 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!vinculo.ativo || removerVinculo.isPending}
                                onClick={() => removerVinculo.mutate(vinculo.id)}
                              >
                                Desvincular
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </section>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function formatarData(valor: string | null) {
  if (!valor) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(valor));
}
