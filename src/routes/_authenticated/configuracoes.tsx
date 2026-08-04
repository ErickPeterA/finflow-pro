import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { TopBar } from "@/components/TopBar";
import { Bloco, SemDados } from "@/components/ui-blocos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { useCategorias, useEmpresas } from "@/lib/data";
import { grupoLabels } from "@/lib/dre";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações | Ecossistema Financeiro BPO" },
      {
        name: "description",
        content:
          "Cadastre empresas atendidas e acompanhe o plano de contas gerencial usado no DRE por regime de caixa.",
      },
      { property: "og:title", content: "Configurações | Ecossistema Financeiro BPO" },
      {
        property: "og:description",
        content: "Empresas, plano de contas e parâmetros da operação de BPO.",
      },
    ],
  }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const { empresaId, setEmpresaId } = useApp();
  const queryClient = useQueryClient();
  const { data: empresas = [] } = useEmpresas();
  const { data: categorias = [] } = useCategorias(empresaId);
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");

  const criar = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Informe o nome da empresa.");
      const { data, error } = await supabase
        .from("empresas")
        .insert({ nome: nome.trim().slice(0, 160), cnpj: cnpj.trim().slice(0, 20) || null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Empresa cadastrada.");
      setNome("");
      setCnpj("");
      setEmpresaId(id);
      queryClient.invalidateQueries({ queryKey: ["empresas"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao cadastrar."),
  });

  return (
    <>
      <TopBar titulo="Configurações" descricao="Empresas atendidas e plano de contas gerencial" />
      <main className="space-y-5 p-6">
        <Bloco titulo="Nova empresa">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome do cliente</Label>
              <Input
                id="nome"
                maxLength={160}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                maxLength={20}
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
              />
            </div>
            <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
              <Plus className="mr-2 h-4 w-4" />
              {criar.isPending ? "Salvando..." : "Cadastrar"}
            </Button>
          </div>
        </Bloco>

        <Bloco titulo={`Empresas (${empresas.length})`}>
          {empresas.length === 0 ? (
            <SemDados mensagem="Nenhuma empresa cadastrada ainda." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {empresas.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => setEmpresaId(e.id)}
                    className={
                      "w-full rounded-lg border p-4 text-left transition-colors hover:border-info " +
                      (e.id === empresaId ? "border-info bg-info-soft" : "bg-card")
                    }
                  >
                    <p className="font-medium">{e.nome}</p>
                    <p className="text-xs text-muted-foreground">{e.cnpj ?? "sem CNPJ"}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        <Bloco titulo={`Plano de contas gerencial (${categorias.length})`}>
          {categorias.length === 0 ? (
            <SemDados mensagem="Selecione uma empresa para visualizar o plano de contas." />
          ) : (
            <div className="-mx-5 -mb-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-2 text-left font-medium">Categoria</th>
                    <th className="px-3 py-2 text-left font-medium">Grupo</th>
                    <th className="px-3 py-2 text-left font-medium">Classificação</th>
                    <th className="px-5 py-2 text-left font-medium">Recorrente</th>
                  </tr>
                </thead>
                <tbody>
                  {categorias.map((c) => (
                    <tr key={c.id} className="border-b">
                      <td className="px-5 py-2 font-medium">{c.nome}</td>
                      <td className="px-3 py-2 text-muted-foreground">{grupoLabels[c.grupo]}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {c.classificacao === "fixo" ? "Fixo" : "Variável"}
                      </td>
                      <td className="px-5 py-2 text-muted-foreground">
                        {c.recorrente ? "Sim" : "Não"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Bloco>
      </main>
    </>
  );
}
