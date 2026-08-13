import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Building2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useEmpresas } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/projetos")({
  head: () => ({
    meta: [
      { title: "Projetos | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content: "Selecione ou crie um projeto para iniciar a análise financeira.",
      },
    ],
  }),
  component: ProjetosPage,
});

function ProjetosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { empresaId, setEmpresaId } = useApp();
  const { data: empresas = [], isLoading } = useEmpresas();
  const [nome, setNome] = useState("");
  const [novoProjetoAberto, setNovoProjetoAberto] = useState(false);

  function abrirProjeto(id: string) {
    setEmpresaId(id);
    navigate({ to: "/home" });
  }

  const criar = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Informe o nome do projeto.");

      const { data: usuario, error: userError } = await supabase.auth.getUser();
      if (userError || !usuario.user) throw new Error("Sessão expirada. Entre novamente.");

      const { data, error } = await supabase
        .from("empresas")
        .insert({
          nome: nome.trim().slice(0, 160),
          created_by: usuario.user.id,
        })
        .select("id")
        .single();

      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Projeto criado.");
      setNome("");
      setNovoProjetoAberto(false);
      queryClient.invalidateQueries({ queryKey: ["empresas"] });
      abrirProjeto(id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao criar projeto."),
  });

  return (
    <>
      <TopBar
        titulo="Projetos"
        descricao="Escolha onde quer trabalhar ou crie um novo projeto"
        mostrarContexto={false}
        acoes={
          <Dialog open={novoProjetoAberto} onOpenChange={setNovoProjetoAberto}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Novo projeto
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo projeto</DialogTitle>
                <DialogDescription>Informe apenas o nome para começar.</DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  criar.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="projeto-nome">Nome do projeto</Label>
                  <Input
                    id="projeto-nome"
                    maxLength={160}
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Ex.: Cliente ABC"
                    autoFocus
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={criar.isPending || !nome.trim()}>
                    {criar.isPending ? "Criando..." : "Criar e acessar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <main className="p-6">
        <section className="mx-auto max-w-6xl">
          <div className="rounded-lg border bg-card shadow-card">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
              <h2 className="text-sm font-semibold">Projetos cadastrados</h2>
              <span className="text-xs text-muted-foreground">{empresas.length} no total</span>
            </div>
            <div className="p-5">
              {isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-28 rounded-lg border bg-muted/40" />
                  ))}
                </div>
              ) : empresas.length === 0 ? (
                <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">Nenhum projeto ainda</p>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Crie o primeiro projeto para liberar a Home, importação, DRE e relatórios.
                  </p>
                </div>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {empresas.map((empresa) => (
                    <li key={empresa.id}>
                      <button
                        onClick={() => abrirProjeto(empresa.id)}
                        className={cn(
                          "group flex h-32 w-full flex-col justify-between rounded-lg border bg-card p-4 text-left transition-colors hover:border-info hover:bg-info-soft/40",
                          empresa.id === empresaId && "border-info bg-info-soft",
                        )}
                      >
                        <span>
                          <span className="flex items-center gap-2 text-sm font-semibold">
                            <Building2 className="h-4 w-4 text-info" />
                            <span className="truncate">{empresa.nome}</span>
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-info">
                          Acessar
                          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
