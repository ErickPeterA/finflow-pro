import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Link2, RefreshCw, UserMinus, UserPlus } from "lucide-react";
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
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

async function carregarAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function exigirAdmin(userId: string) {
  const supabaseAdmin = await carregarAdmin();
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Acesso restrito a administradores.");

  return supabaseAdmin;
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

function usuarioEstaAtivo(bannedUntil: string | null | undefined) {
  if (!bannedUntil) return true;
  const data = new Date(bannedUntil);
  return Number.isNaN(data.getTime()) || data <= new Date();
}

async function montarPainel(adminId: string) {
  const supabaseAdmin = await exigirAdmin(adminId);

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (authError) throw authError;

  const ids = authData.users.map((u) => u.id);

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, nome, email")
    .in("id", ids);
  if (profilesError) throw profilesError;

  const { data: projetos, error: projetosError } = await supabaseAdmin
    .from("empresas")
    .select("id, nome, cnpj, ativo")
    .order("nome");
  if (projetosError) throw projetosError;

  const { data: vinculos, error: vinculosError } = await supabaseAdmin
    .from("projeto_usuarios")
    .select("id, empresa_id, user_id, perfil, ativo, created_at")
    .order("created_at", { ascending: false });
  if (vinculosError) throw vinculosError;

  const profilePorId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const usuarios: UsuarioGerenciado[] = authData.users
    .map((user) => {
      const profile = profilePorId.get(user.id);
      const bannedUntil = (user as { banned_until?: string | null }).banned_until;
      const nomeMetadata = user.user_metadata?.["nome"];

      return {
        id: user.id,
        email: user.email ?? profile?.email ?? "sem e-mail",
        nome:
          profile?.nome ||
          (typeof nomeMetadata === "string" ? nomeMetadata : "") ||
          user.email?.split("@")[0] ||
          "Usuário",
        ativo: usuarioEstaAtivo(bannedUntil),
        criadoEm: user.created_at ?? null,
        ultimoAcesso: user.last_sign_in_at ?? null,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => montarPainel(String(context.userId)));

const criarLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { nome: string; email: string; senha: string }) => {
    const nome = data.nome.trim();
    const email = criarEmailAutenticacao(data.email);
    const senha = data.senha.trim();

    if (!nome) throw new Error("Informe o nome do usuário.");
    if (!email) throw new Error("Informe um e-mail fictício com @, como erick@vg.");
    if (senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");

    return { nome: nome.slice(0, 160), email, senha };
  })
  .handler(async ({ context, data }) => {
    const adminId = String(context.userId);
    const supabaseAdmin = await exigirAdmin(adminId);

    const { data: userData, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });

    if (error) {
      if (error.message.toLowerCase().includes("already")) {
        throw new Error("Já existe um login com esse e-mail.");
      }
      throw error;
    }

    const userId = userData.user?.id;
    if (!userId) throw new Error("Login criado sem usuário associado.");

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      nome: data.nome,
      email: data.email,
    });
    if (profileError) throw profileError;

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "consultor" })
      .select("id")
      .single();
    if (roleError && !roleError.message.toLowerCase().includes("duplicate")) throw roleError;

    return { ok: true };
  });

const alterarStatusUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { userId: string; ativo: boolean }) => {
    if (!data.userId) throw new Error("Usuário inválido.");
    return data;
  })
  .handler(async ({ context, data }) => {
    const adminId = String(context.userId);
    const supabaseAdmin = await exigirAdmin(adminId);

    if (data.userId === adminId && !data.ativo) {
      throw new Error("Você não pode desativar o próprio usuário.");
    }

    const payload = data.ativo ? { ban_duration: "none" } : { ban_duration: "876000h" };
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, payload);
    if (error) throw error;

    return { ok: true };
  });

const salvarVinculo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    const supabaseAdmin = await exigirAdmin(adminId);

    const { data: projeto, error: projetoError } = await supabaseAdmin
      .from("empresas")
      .select("id")
      .eq("id", data.empresaId)
      .maybeSingle();
    if (projetoError) throw projetoError;
    if (!projeto) throw new Error("Projeto não encontrado.");

    const { error } = await supabaseAdmin.from("projeto_usuarios").upsert(
      {
        user_id: data.userId,
        empresa_id: data.empresaId,
        perfil: data.perfil,
        ativo: true,
        created_by: adminId,
      },
      { onConflict: "empresa_id,user_id" },
    );
    if (error) throw error;

    return { ok: true };
  });

const desativarVinculo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { vinculoId: string }) => {
    if (!data.vinculoId) throw new Error("Vínculo inválido.");
    return data;
  })
  .handler(async ({ context, data }) => {
    const adminId = String(context.userId);
    const supabaseAdmin = await exigirAdmin(adminId);

    const { error } = await supabaseAdmin
      .from("projeto_usuarios")
      .update({ ativo: false })
      .eq("id", data.vinculoId);
    if (error) throw error;

    return { ok: true };
  });

function GerenciamentoPage() {
  const { aba } = Route.useSearch();
  const queryClient = useQueryClient();
  const listarPainelFn = useServerFn(listarPainel);
  const criarLoginFn = useServerFn(criarLogin);
  const alterarStatusFn = useServerFn(alterarStatusUsuario);
  const salvarVinculoFn = useServerFn(salvarVinculo);
  const desativarVinculoFn = useServerFn(desativarVinculo);

  const [novoLogin, setNovoLogin] = useState({ nome: "", email: "", senha: "" });
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
                    placeholder="Mínimo de 6 caracteres"
                    minLength={6}
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
