import { createFileRoute, useNavigate } from "@tanstack/react-router";
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

function AuthPage() {
  const navigate = useNavigate();
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home", replace: true });
    });
  }, [navigate]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        navigate({ to: "/home", replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: {
            emailRedirectTo: window.location.origin,
            data: { nome },
          },
        });
        if (error) throw error;
        if (data.session) {
          navigate({ to: "/home", replace: true });
        } else {
          toast.success("Conta criada. Confirme o e-mail para acessar.");
          setModo("entrar");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível autenticar.");
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
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
