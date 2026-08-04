import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, UserCog } from "lucide-react";
import { toast } from "sonner";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

type Cargo = Database["public"]["Enums"]["app_role"];

interface UsuarioGerenciado {
  id: string;
  email: string;
  nome: string;
  cargo: Cargo;
  criadoEm: string | null;
  ultimoAcesso: string | null;
}

const cargos: Cargo[] = ["admin", "consultor", "cliente"];

const cargoLabels: Record<Cargo, string> = {
  admin: "Admin",
  consultor: "Consultor",
  cliente: "Cliente",
};

const cargoDescricoes: Record<Cargo, string> = {
  admin: "Acesso total, inclusive gerenciamento de usuários.",
  consultor: "Acesso operacional aos projetos e relatórios.",
  cliente: "Perfil reservado para acesso restrito do cliente.",
};

export const Route = createFileRoute("/_authenticated/gerenciamento")({
  head: () => ({
    meta: [
      { title: "Gerenciamento | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content: "Gerencie usuários e cargos da plataforma.",
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

const listarUsuarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = String(context.userId);
    const supabaseAdmin = await exigirAdmin(userId);

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

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids);
    if (rolesError) throw rolesError;

    const profilePorId = new Map((profiles ?? []).map((p) => [p.id, p]));
    const rolesPorId = new Map<string, Cargo[]>();
    for (const role of roles ?? []) {
      const lista = rolesPorId.get(role.user_id) ?? [];
      lista.push(role.role);
      rolesPorId.set(role.user_id, lista);
    }

    const prioridade = (lista: Cargo[] | undefined): Cargo => {
      if (lista?.includes("admin")) return "admin";
      if (lista?.includes("consultor")) return "consultor";
      if (lista?.includes("cliente")) return "cliente";
      return "consultor";
    };

    const usuarios: UsuarioGerenciado[] = authData.users
      .map((user) => {
        const profile = profilePorId.get(user.id);
        return {
          id: user.id,
          email: user.email ?? profile?.email ?? "sem e-mail",
          nome:
            profile?.nome ||
            (typeof user.user_metadata?.nome === "string" ? user.user_metadata.nome : "") ||
            user.email?.split("@")[0] ||
            "Usuário",
          cargo: prioridade(rolesPorId.get(user.id)),
          criadoEm: user.created_at ?? null,
          ultimoAcesso: user.last_sign_in_at ?? null,
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));

    return { usuarios, usuarioAtualId: userId };
  });

const alterarCargoUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { userId: string; cargo: Cargo }) => {
    if (!data.userId) throw new Error("Usuário inválido.");
    if (!cargos.includes(data.cargo)) throw new Error("Cargo inválido.");
    return data;
  })
  .handler(async ({ context, data }) => {
    const adminId = String(context.userId);
    const supabaseAdmin = await exigirAdmin(adminId);

    const { count, error: countError } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (countError) throw countError;

    const { data: cargoAtual, error: cargoAtualError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (cargoAtualError) throw cargoAtualError;

    if (cargoAtual && data.cargo !== "admin" && (count ?? 0) <= 1) {
      throw new Error("Mantenha pelo menos um administrador ativo.");
    }

    const { error: deleteError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (deleteError) throw deleteError;

    const { error: insertError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.cargo });
    if (insertError) throw insertError;

    return { ok: true };
  });

function GerenciamentoPage() {
  const queryClient = useQueryClient();
  const listarUsuariosFn = useServerFn(listarUsuarios);
  const alterarCargoFn = useServerFn(alterarCargoUsuario);

  const usuariosQuery = useQuery({
    queryKey: ["gerenciamento-usuarios"],
    queryFn: () => listarUsuariosFn(),
  });

  const alterarCargo = useMutation({
    mutationFn: (data: { userId: string; cargo: Cargo }) => alterarCargoFn({ data }),
    onSuccess: () => {
      toast.success("Cargo atualizado.");
      queryClient.invalidateQueries({ queryKey: ["gerenciamento-usuarios"] });
      queryClient.invalidateQueries({ queryKey: ["meu-cargo"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar cargo."),
  });

  const usuarios = usuariosQuery.data?.usuarios ?? [];
  const usuarioAtualId = usuariosQuery.data?.usuarioAtualId;

  return (
    <>
      <TopBar
        titulo="Gerenciamento"
        descricao="Usuários, cargos e permissões da plataforma"
        mostrarContexto={false}
      />
      <main className="space-y-5 p-6">
        <section className="grid gap-4 md:grid-cols-3">
          {cargos.map((cargo) => (
            <div key={cargo} className="rounded-lg border bg-card p-4 shadow-card">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    cargo === "admin" ? "bg-info-soft text-info" : "bg-muted text-muted-foreground",
                  )}
                >
                  {cargo === "admin" ? (
                    <ShieldCheck className="h-5 w-5" />
                  ) : (
                    <UserCog className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold">{cargoLabels[cargo]}</p>
                  <p className="text-xs text-muted-foreground">{cargoDescricoes[cargo]}</p>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-lg border bg-card shadow-card">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
            <h2 className="text-sm font-semibold">Usuários</h2>
            <span className="text-xs text-muted-foreground">{usuarios.length} no total</span>
          </div>

          {usuariosQuery.isLoading ? (
            <div className="p-5">
              <div className="h-40 rounded-lg border bg-muted/40" />
            </div>
          ) : usuariosQuery.isError ? (
            <div className="p-5">
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm font-medium">Acesso indisponível</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {usuariosQuery.error instanceof Error
                    ? usuariosQuery.error.message
                    : "Não foi possível carregar os usuários."}
                </p>
              </div>
            </div>
          ) : (
            <div className="-mx-px overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-2 text-left font-medium">Usuário</th>
                    <th className="px-3 py-2 text-left font-medium">Cargo</th>
                    <th className="px-3 py-2 text-left font-medium">Criado em</th>
                    <th className="px-3 py-2 text-left font-medium">Último acesso</th>
                    <th className="px-5 py-2 text-right font-medium">Alterar cargo</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((usuario) => (
                    <tr key={usuario.id} className="border-b last:border-b-0">
                      <td className="px-5 py-3">
                        <p className="font-medium">
                          {usuario.nome}
                          {usuario.id === usuarioAtualId && (
                            <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{usuario.email}</p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={usuario.cargo === "admin" ? "default" : "secondary"}>
                          {cargoLabels[usuario.cargo]}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {formatarData(usuario.criadoEm)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {formatarData(usuario.ultimoAcesso)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="ml-auto w-44">
                          <Select
                            value={usuario.cargo}
                            disabled={alterarCargo.isPending}
                            onValueChange={(cargo) =>
                              alterarCargo.mutate({ userId: usuario.id, cargo: cargo as Cargo })
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {cargos.map((cargo) => (
                                <SelectItem key={cargo} value={cargo}>
                                  {cargoLabels[cargo]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => usuariosQuery.refetch()}
            disabled={usuariosQuery.isFetching}
          >
            {usuariosQuery.isFetching ? "Atualizando..." : "Atualizar lista"}
          </Button>
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
