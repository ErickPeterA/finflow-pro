export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      categorias: {
        Row: {
          ativo: boolean
          classificacao: Database["public"]["Enums"]["classificacao_custo"]
          created_at: string
          empresa_id: string
          grupo: Database["public"]["Enums"]["grupo_dre"]
          id: string
          nome: string
          ordem: number
          recorrente: boolean
        }
        Insert: {
          ativo?: boolean
          classificacao?: Database["public"]["Enums"]["classificacao_custo"]
          created_at?: string
          empresa_id: string
          grupo: Database["public"]["Enums"]["grupo_dre"]
          id?: string
          nome: string
          ordem?: number
          recorrente?: boolean
        }
        Update: {
          ativo?: boolean
          classificacao?: Database["public"]["Enums"]["classificacao_custo"]
          created_at?: string
          empresa_id?: string
          grupo?: Database["public"]["Enums"]["grupo_dre"]
          id?: string
          nome?: string
          ordem?: number
          recorrente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "categorias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes: {
        Row: {
          empresa_id: string
          id: string
          limite_atencao: number
          margem_desejada: number
          regras: Json
          updated_at: string
        }
        Insert: {
          empresa_id: string
          id?: string
          limite_atencao?: number
          margem_desejada?: number
          regras?: Json
          updated_at?: string
        }
        Update: {
          empresa_id?: string
          id?: string
          limite_atencao?: number
          margem_desejada?: number
          regras?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuracoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          ativo: boolean
          cnpj: string | null
          cor_primaria: string
          created_at: string
          created_by: string | null
          id: string
          logo_url: string | null
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cnpj?: string | null
          cor_primaria?: string
          created_at?: string
          created_by?: string | null
          id?: string
          logo_url?: string | null
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cnpj?: string | null
          cor_primaria?: string
          created_at?: string
          created_by?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      importacoes: {
        Row: {
          arquivo_nome: string
          arquivo_path: string | null
          competencia: string
          created_at: string
          created_by: string | null
          duplicados: number
          empresa_id: string
          id: string
          status: string
          tipo: Database["public"]["Enums"]["tipo_lancamento"]
          total_registros: number
          valor_total: number
        }
        Insert: {
          arquivo_nome: string
          arquivo_path?: string | null
          competencia: string
          created_at?: string
          created_by?: string | null
          duplicados?: number
          empresa_id: string
          id?: string
          status?: string
          tipo: Database["public"]["Enums"]["tipo_lancamento"]
          total_registros?: number
          valor_total?: number
        }
        Update: {
          arquivo_nome?: string
          arquivo_path?: string | null
          competencia?: string
          created_at?: string
          created_by?: string | null
          duplicados?: number
          empresa_id?: string
          id?: string
          status?: string
          tipo?: Database["public"]["Enums"]["tipo_lancamento"]
          total_registros?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos: {
        Row: {
          categoria_id: string | null
          categoria_nibo: string | null
          centro_custo: string | null
          competencia: string
          conta_bancaria: string | null
          created_at: string
          data_efetiva: string
          descricao: string
          empresa_id: string
          hash: string
          id: string
          importacao_id: string | null
          nao_recorrente: boolean
          pessoa: string | null
          tipo: Database["public"]["Enums"]["tipo_lancamento"]
          tratamento: Database["public"]["Enums"]["tratamento_lancamento"]
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          categoria_nibo?: string | null
          centro_custo?: string | null
          competencia: string
          conta_bancaria?: string | null
          created_at?: string
          data_efetiva: string
          descricao?: string
          empresa_id: string
          hash: string
          id?: string
          importacao_id?: string | null
          nao_recorrente?: boolean
          pessoa?: string | null
          tipo: Database["public"]["Enums"]["tipo_lancamento"]
          tratamento?: Database["public"]["Enums"]["tratamento_lancamento"]
          valor?: number
        }
        Update: {
          categoria_id?: string | null
          categoria_nibo?: string | null
          centro_custo?: string | null
          competencia?: string
          conta_bancaria?: string | null
          created_at?: string
          data_efetiva?: string
          descricao?: string
          empresa_id?: string
          hash?: string
          id?: string
          importacao_id?: string | null
          nao_recorrente?: boolean
          pessoa?: string | null
          tipo?: Database["public"]["Enums"]["tipo_lancamento"]
          tratamento?: Database["public"]["Enums"]["tratamento_lancamento"]
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      mapeamentos: {
        Row: {
          categoria_id: string | null
          categoria_nibo: string
          created_at: string
          empresa_id: string
          id: string
          tratamento: Database["public"]["Enums"]["tratamento_lancamento"]
        }
        Insert: {
          categoria_id?: string | null
          categoria_nibo: string
          created_at?: string
          empresa_id: string
          id?: string
          tratamento?: Database["public"]["Enums"]["tratamento_lancamento"]
        }
        Update: {
          categoria_id?: string | null
          categoria_nibo?: string
          created_at?: string
          empresa_id?: string
          id?: string
          tratamento?: Database["public"]["Enums"]["tratamento_lancamento"]
        }
        Relationships: [
          {
            foreignKeyName: "mapeamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mapeamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      metas: {
        Row: {
          competencia: string
          created_at: string
          empresa_id: string
          id: string
          tipo: string
          valor: number
        }
        Insert: {
          competencia: string
          created_at?: string
          empresa_id: string
          id?: string
          tipo: string
          valor?: number
        }
        Update: {
          competencia?: string
          created_at?: string
          empresa_id?: string
          id?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "metas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      periodos_fechados: {
        Row: {
          competencia: string
          empresa_id: string
          fechado: boolean
          fechado_em: string
          fechado_por: string | null
          id: string
          justificativa_reabertura: string | null
          reaberto_em: string | null
        }
        Insert: {
          competencia: string
          empresa_id: string
          fechado?: boolean
          fechado_em?: string
          fechado_por?: string | null
          id?: string
          justificativa_reabertura?: string | null
          reaberto_em?: string | null
        }
        Update: {
          competencia?: string
          empresa_id?: string
          fechado?: boolean
          fechado_em?: string
          fechado_por?: string | null
          id?: string
          justificativa_reabertura?: string | null
          reaberto_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "periodos_fechados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      planos_acao: {
        Row: {
          acao: string
          categoria: string | null
          comentarios: string | null
          competencia_origem: string | null
          concluido_em: string | null
          created_at: string
          created_by: string | null
          empresa_id: string
          evidencias: string | null
          id: string
          prazo: string | null
          prioridade: string
          problema: string
          responsavel: string | null
          resultado_esperado: string | null
          status: Database["public"]["Enums"]["status_acao"]
          updated_at: string
        }
        Insert: {
          acao: string
          categoria?: string | null
          comentarios?: string | null
          competencia_origem?: string | null
          concluido_em?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id: string
          evidencias?: string | null
          id?: string
          prazo?: string | null
          prioridade?: string
          problema: string
          responsavel?: string | null
          resultado_esperado?: string | null
          status?: Database["public"]["Enums"]["status_acao"]
          updated_at?: string
        }
        Update: {
          acao?: string
          categoria?: string | null
          comentarios?: string | null
          competencia_origem?: string | null
          concluido_em?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          evidencias?: string | null
          id?: string
          prazo?: string | null
          prioridade?: string
          problema?: string
          responsavel?: string | null
          resultado_esperado?: string | null
          status?: Database["public"]["Enums"]["status_acao"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planos_acao_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      relatorios: {
        Row: {
          blocos: Json
          competencia: string
          created_at: string
          created_by: string | null
          empresa_id: string
          id: string
          textos: Json
          titulo: string
          versao: number
        }
        Insert: {
          blocos?: Json
          competencia: string
          created_at?: string
          created_by?: string | null
          empresa_id: string
          id?: string
          textos?: Json
          titulo?: string
          versao?: number
        }
        Update: {
          blocos?: Json
          competencia?: string
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          id?: string
          textos?: Json
          titulo?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "relatorios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "consultor" | "cliente"
      classificacao_custo: "fixo" | "variavel"
      grupo_dre:
        | "receita_operacional"
        | "deducoes"
        | "custos"
        | "despesas"
        | "financeiro"
        | "nao_operacional"
      status_acao:
        | "pendente"
        | "em_andamento"
        | "aguardando_cliente"
        | "atrasado"
        | "concluido"
        | "cancelado"
      tipo_lancamento: "recebida" | "paga"
      tratamento_lancamento:
        | "operacional"
        | "transferencia"
        | "emprestimo"
        | "aporte"
        | "resgate"
        | "aplicacao"
        | "investimento"
        | "compra_ativo"
        | "reembolso"
        | "estorno"
        | "juros"
        | "multa"
        | "tarifa"
        | "receita_financeira"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "consultor", "cliente"],
      classificacao_custo: ["fixo", "variavel"],
      grupo_dre: [
        "receita_operacional",
        "deducoes",
        "custos",
        "despesas",
        "financeiro",
        "nao_operacional",
      ],
      status_acao: [
        "pendente",
        "em_andamento",
        "aguardando_cliente",
        "atrasado",
        "concluido",
        "cancelado",
      ],
      tipo_lancamento: ["recebida", "paga"],
      tratamento_lancamento: [
        "operacional",
        "transferencia",
        "emprestimo",
        "aporte",
        "resgate",
        "aplicacao",
        "investimento",
        "compra_ativo",
        "reembolso",
        "estorno",
        "juros",
        "multa",
        "tarifa",
        "receita_financeira",
      ],
    },
  },
} as const
