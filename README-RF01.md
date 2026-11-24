# SIIGP — Módulo RF01: Cadastro e Gestão de Empreendimentos

Next.js 15 (App Router) + React 19 + TypeScript + Prisma 6 + PostgreSQL 16. Somente o RF01 (RF-001 a RF-010) está implementado; RF02–RF14 estão fora do escopo.

## Como executar
```bash
cp .env.example .env            # ajuste DATABASE_URL, SESSION_SECRET (≥32 caracteres), SEED_*
npm install
npx prisma generate
npm run db:migrate              # prisma migrate deploy  (alternativa sem binários do Prisma: npm run db:apply)
npm run db:seed                 # cria organização + usuário ADMIN a partir de SEED_*
npm run db:seed:demo            # (opcional) dados de demonstração: "Condomínio Residencial Atenas"
npm run dev                     # http://localhost:3000   |   produção: npm run build && npm start
npm test                        # exige TEST_DATABASE_URL apontando para um banco VAZIO/descartável (é resetado!)
```
Anexos são gravados em `STORAGE_DIR` (fora de `public/`) e só são servidos por `/api/attachments/:id`, autenticado.

## Arquitetura
- `src/app/(app)/…` telas (client components) · `src/app/api/**` rotas HTTP finas · `src/server/services/*` regras de negócio · `src/server/validation.ts` esquemas Zod · `prisma/` schema + migrations (SQL com triggers/CHECKs).
- Multi-organização: toda tabela tem `organization_id`; todo serviço recebe `Ctx {organizationId, userId, role}` vindo da sessão (JWT HttpOnly, revalidado no banco a cada requisição).
- Papéis: ADMIN (inclui ativar/desativar cliente/empreendimento), EDITOR (escrita), VIEWER (leitura, dados pessoais mascarados — LGPD).
- Exclusão lógica (`status`), auditoria append-only (`audit_logs`), histórico nunca apagado (anulação com motivo).
- Integridade também no banco: triggers `integrity:*` (mesma organização/empreendimento, ciclos na hierarquia, imutabilidade de chaves), CHECKs (formatos, áreas ≥ 0, períodos).

## Modelo de dados (13 tabelas)
organizations, users, clients, projects, project_characteristics (1:1), buildings, locations (auto-relacionada: pavimentos, ambientes, áreas comuns/externas/técnicas, unidades), private_units (1:1 com locations do tipo UNIT, sem dados de moradores), project_responsibles, project_responsible_assignments (função + período), project_history, project_history_attachments, audit_logs. Contagens de blocos/pavimentos/unidades são **calculadas**, nunca gravadas. Detalhes em `prisma/schema.prisma` e `prisma/migrations/`.

## API (39 rotas, `/api/…`)
auth: login, logout, me · clients (+/:id, deactivate, reactivate) · projects (+/:id, overview, characteristics, deactivate, reactivate, buildings, tree, locations, units, assignments, history) · buildings/:id (+deactivate, reactivate, reorder) · locations/:id (+move, deactivate, reactivate, reorder) · responsibles (+/:id, status) · assignments/:id (+end) · history/:id (+void, restore, attachments) · attachments/:id (GET/DELETE) · audit. Erros: `{error:{code,message,details}}`; validação 422 com `details.fields`.

## Telas
01 lista de clientes `/clientes` · 02 formulário de cliente `/clientes/novo`, `/clientes/:id` · 03 lista de empreendimentos `/empreendimentos` · 04 formulário (seções: dados básicos, endereço, caracterização) `/empreendimentos/novo`, `…/:id/editar` · 05 visão geral com indicadores calculados `…/:id` · 06 estrutura física (árvore + painel de detalhes) `…/:id/estrutura` · 07 responsáveis `…/:id/responsaveis` (+ cadastro global `/responsaveis`) · 08 histórico em linha do tempo com filtros `…/:id/historico`.

## Limitações conhecidas
- Limite de tentativas de login é em memória (um processo); em produção com várias instâncias use Redis/gateway.
- Anexos em disco local; em produção usar armazenamento de objetos com acesso privado.
- Não há tela de gestão de usuários (fora do RF01); usuários são criados por seed/SQL.
- Sem exclusão física de cadastros (por desenho); a árvore não oferece "excluir", apenas desativar.
- Testes de interface são scripts Playwright ad hoc (não versionados como suíte); a cobertura automatizada versionada é de serviços/API/banco.
- Seletor de cliente no formulário de empreendimento lista os 50 primeiros ativos (com filtro por texto).
