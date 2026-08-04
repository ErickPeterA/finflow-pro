import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { brl, pct } from "@/lib/format";

export type Tom = "positivo" | "negativo" | "atencao" | "neutro" | "extra";

const tons: Record<Tom, string> = {
  positivo: "text-positive",
  negativo: "text-negative",
  atencao: "text-warning",
  neutro: "text-info",
  extra: "text-extra",
};

const fundos: Record<Tom, string> = {
  positivo: "bg-positive-soft text-positive",
  negativo: "bg-negative-soft text-negative",
  atencao: "bg-warning-soft text-warning",
  neutro: "bg-info-soft text-info",
  extra: "bg-extra-soft text-extra",
};

export function Kpi({
  titulo,
  valor,
  variacaoPct,
  anterior,
  tom = "neutro",
  legenda,
}: {
  titulo: string;
  valor: number;
  variacaoPct?: number | null | undefined;
  anterior?: number | undefined;
  tom?: Tom | undefined;
  legenda?: string | undefined;
}) {
  const sobe = (variacaoPct ?? 0) > 0;
  const desce = (variacaoPct ?? 0) < 0;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <p className={cn("tabular mt-2 text-2xl font-semibold", tons[tom])}>{brl(valor)}</p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {variacaoPct == null ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Minus className="h-3 w-3" /> sem base
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
              sobe ? fundos.positivo : desce ? fundos.negativo : fundos.neutro,
            )}
          >
            {sobe ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : desce ? (
              <ArrowDownRight className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {pct(Math.abs(variacaoPct))}
          </span>
        )}
        <span className="truncate text-muted-foreground">
          {legenda ?? (anterior !== undefined ? `mês anterior ${brl(anterior, true)}` : "")}
        </span>
      </div>
    </div>
  );
}

export function Bloco({
  titulo,
  acoes,
  children,
  className,
}: {
  titulo: string;
  acoes?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-card", className)}>
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {acoes}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function SemEmpresa({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-xl border border-dashed bg-card p-10 text-center">
      <p className="text-sm font-medium">Nenhuma empresa selecionada</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Selecione um projeto no topo da tela ou crie o primeiro em Projetos.
      </p>
      {children}
    </div>
  );
}

export function SemDados({ mensagem }: { mensagem: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {mensagem}
    </div>
  );
}
