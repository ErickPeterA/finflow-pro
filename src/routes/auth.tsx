import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acessar | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content:
          "Acesso restrito da equipe VG ao ecossistema de gestão financeira e DRE gerencial dos clientes de BPO.",
      },
      { property: "og:title", content: "Acessar | Ecossistema Financeiro BPO" },
      {
        property: "og:description",
        content: "Área restrita da plataforma de BPO financeiro da VG.",
      },
    ],
  }),
  component: AuthPage,
});

const criarUsuarioConfirmado = createServerFn({ method: "POST" })
  .validator((data: { email: string; senha: string; nome: string }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });

    if (error && !error.message.toLowerCase().includes("already")) {
      throw error;
    }

    return { ok: true };
  });

function mensagemErroAutenticacao(err: unknown) {
  if (!(err instanceof Error)) return "Não foi possível autenticar.";

  const erro = err as Error & { code?: string; status?: number };
  const mensagem = erro.message.toLowerCase();

  if (
    erro.status === 429 ||
    erro.code === "over_email_send_rate_limit" ||
    mensagem.includes("email rate limit")
  ) {
    return "Limite de envio de e-mails atingido. Aguarde um tempo antes de tentar novamente ou configure SMTP próprio no Supabase.";
  }

  return erro.message;
}

function criarEmailAutenticacao(valor: string) {
  const entrada = valor.trim().toLowerCase();
  if (!entrada) return null;
  if (!entrada.includes("@")) return null;

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

function AuthPage() {
  const navigate = useNavigate();
  const criarUsuario = useServerFn(criarUsuarioConfirmado);
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/projetos", replace: true });
    });
  }, [navigate]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const emailAutenticacao = criarEmailAutenticacao(email);

    if (!emailAutenticacao) {
      toast.error("Informe um e-mail fictício com @, como erick@vg.");
      return;
    }

    setCarregando(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailAutenticacao,
          password: senha,
        });
        if (error) throw error;
        navigate({ to: "/projetos", replace: true });
      } else {
        await criarUsuario({ data: { email: emailAutenticacao, senha, nome } });

        const { error } = await supabase.auth.signInWithPassword({
          email: emailAutenticacao,
          password: senha,
        });
        if (error) throw error;
        navigate({ to: "/projetos", replace: true });
      }
    } catch (err) {
      toast.error(mensagemErroAutenticacao(err));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-navy-deep p-12 text-navy-foreground lg:flex">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
          VG
        </div>
        <div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight">
            Do relatório do NIBO ao relatório do cliente, em um único ecossistema.
          </h2>
          <p className="mt-4 max-w-md text-sm text-navy-foreground/70">
            Importação, conferência, classificação, DRE gerencial por regime de caixa, análises
            automáticas, plano de ação e relatório final.
          </p>
        </div>
        <p className="text-xs text-navy-foreground/50">BPO Financeiro · VG</p>
      </section>

      <section className="flex items-center justify-center p-8">
        <form onSubmit={enviar} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {modo === "entrar" ? "Acessar plataforma" : "Criar acesso"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Área restrita da equipe de BPO financeiro.
            </p>
          </div>

          {modo === "criar" && (
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">E-mail fictício</Label>
            <Input
              id="email"
              type="text"
              placeholder="erick@vg ou erick@vg.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              value={senha}
              minLength={6}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={carregando}>
            {carregando ? "Aguarde..." : modo === "entrar" ? "Entrar" : "Criar conta"}
          </Button>

          <button
            type="button"
            onClick={() => setModo(modo === "entrar" ? "criar" : "entrar")}
            className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {modo === "entrar" ? "Não tenho acesso ainda" : "Já tenho acesso"}
          </button>
        </form>
      </section>
    </main>
  );
}
