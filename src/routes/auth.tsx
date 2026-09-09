import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BarChart3, LogIn, Shield, TrendingUp, Wallet } from "lucide-react";
import {
  AUTH_REMEMBER_EMAIL_KEY,
  AUTH_REMEMBER_KEY,
  AUTH_REMEMBER_UNTIL_KEY,
} from "@/lib/auth-storage";
import { getLocalSession, loginLocal } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acessar | VG Finance" },
      {
        name: "description",
        content: "Plataforma de gestão financeira e inteligência de negócios.",
      },
      { property: "og:title", content: "Acessar | VG Finance" },
      {
        property: "og:description",
        content: "Área restrita da plataforma de gestão financeira.",
      },
    ],
  }),
  component: AuthPage,
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
    return "Muitas tentativas de acesso. Aguarde um tempo antes de tentar novamente.";
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

const TRES_DIAS_MS = 3 * 24 * 60 * 60 * 1000;

function lembrarSalvo() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(AUTH_REMEMBER_KEY) !== "false";
}

function emailSalvo() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(AUTH_REMEMBER_EMAIL_KEY) ?? "";
}

function AuthPage() {
  const navigate = useNavigate();
  const consultarSessao = useServerFn(getLocalSession);
  const autenticar = useServerFn(loginLocal);
  const [email, setEmail] = useState(emailSalvo);
  const [senha, setSenha] = useState("");
  const [lembrar, setLembrar] = useState(lembrarSalvo);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    consultarSessao().then(({ user }) => {
      if (user) navigate({ to: "/projetos", replace: true });
    });
  }, [consultarSessao, navigate]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const emailAutenticacao = criarEmailAutenticacao(email);

    if (!emailAutenticacao) {
      toast.error("Informe um e-mail fictício com @, como erick@vg.");
      return;
    }

    setCarregando(true);
    try {
      if (lembrar) {
        localStorage.setItem(AUTH_REMEMBER_KEY, "true");
        localStorage.setItem(AUTH_REMEMBER_UNTIL_KEY, String(Date.now() + TRES_DIAS_MS));
        localStorage.setItem(AUTH_REMEMBER_EMAIL_KEY, email.trim().toLowerCase());
      } else {
        localStorage.setItem(AUTH_REMEMBER_KEY, "false");
        localStorage.removeItem(AUTH_REMEMBER_UNTIL_KEY);
        localStorage.removeItem(AUTH_REMEMBER_EMAIL_KEY);
      }

      await autenticar({ data: { email: emailAutenticacao, password: senha } });
      navigate({ to: "/projetos", replace: true });
    } catch (err) {
      toast.error(mensagemErroAutenticacao(err));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="bg-[#042558] px-7 py-8 text-white lg:min-h-screen lg:px-9 lg:py-9">
        <div className="flex items-center justify-center ">
          <img src="logobranca.png" alt="" className="h-20 w-auto object-contain" />
        </div>

        <div className="mt-20 max-w-[56rem] space-y-8 lg:mt-[5.25rem]">
          <div>
            <h2 className="text-3xl font-bold leading-tight">Inteligência financeira</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/70">
              Automatize a gestão de contas a pagar e receber, acompanhe indicadores em tempo real e
              tome decisões estratégicas com dados confiáveis para decisões mais ágeis.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-white/5 p-4">
              <Wallet className="h-5 w-5 text-white/60" />
              <p className="mt-2 text-xs font-medium text-white/70">Contas a Pagar</p>
            </div>
            <div className="rounded-lg bg-white/5 p-4">
              <TrendingUp className="h-5 w-5 text-white/60" />
              <p className="mt-2 text-xs font-medium text-white/70">Contas a Receber</p>
            </div>
            <div className="rounded-lg bg-white/5 p-4">
              <BarChart3 className="h-5 w-5 text-white/60" />
              <p className="mt-2 text-xs font-medium text-white/70">Relatórios e Gráficos</p>
            </div>
            <div className="rounded-lg bg-white/5 p-4">
              <Shield className="h-5 w-5 text-white/60" />
              <p className="mt-2 text-xs font-medium text-white/70">Dados Seguros</p>
            </div>
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-gray-50 p-8 lg:items-start lg:px-16 lg:pt-[13.25rem]">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center justify-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#042558]">
              <BarChart3 className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-[#042558]">VG Finance</span>
          </div>

          <div className="space-y-1 text-center lg:text-left">
            <h1 className="text-2xl font-bold text-[#042558]">Acessar plataforma</h1>
            <p className="text-sm text-gray-500">
              Entre com suas credenciais para acessar o sistema.
            </p>
          </div>

          <form onSubmit={enviar} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                E-mail
              </Label>
              <Input
                id="email"
                type="text"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="border-gray-200 focus:border-[#042558] focus:ring-[#042558]/20"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="senha" className="text-sm font-medium text-gray-700">
                Senha
              </Label>
              <Input
                id="senha"
                type="password"
                value={senha}
                minLength={8}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                className="border-gray-200 focus:border-[#042558] focus:ring-[#042558]/20"
                required
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={lembrar}
                onChange={(e) => setLembrar(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-[#042558] focus:ring-[#042558]/20"
              />
              Não esqueça de mim por 3 dias
            </label>

            <Button
              type="submit"
              disabled={carregando}
              className="w-full bg-[#042558] text-white transition-all hover:bg-[#042558]/90 hover:shadow-lg hover:shadow-[#042558]/20"
            >
              {carregando ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Aguarde...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  Entrar
                </span>
              )}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
