# Sistema Integrado de Inspecao e Gestao-Predial

O objetivo futuro da plataforma é permitir que engenheiros realizem inspeções prediais, registrem ocorrências, caracterizem manifestações patológicas, realizem diagnósticos, elaborem laudos técnicos, planos de manutenção, planos de reforma e disponibilizem dashboards gerenciais aos clientes.

---

# Módulo RF01 — Cadastro e Gestão de Empreendimentos

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

## Pendências e limitações reais
- Limite de tentativas de login é em memória (um processo); em produção com várias instâncias use Redis/gateway.
- Anexos em disco local; em produção usar armazenamento de objetos com acesso privado.
- Não há tela de gestão de usuários (fora do RF01); usuários são criados por seed/SQL.
- Sem exclusão física de cadastros (por desenho); a árvore não oferece "excluir", apenas desativar.
- Testes de interface são scripts Playwright ad hoc (não versionados como suíte); a cobertura automatizada versionada é de serviços/API/banco.
- Seletor de cliente no formulário de empreendimento lista os 50 primeiros ativos (com filtro por texto).
- Um vínculo de responsável encerrado "hoje" continua vigente até o fim do dia (a data de término vale inclusive).
- `npm run db:apply` foi criado porque o download dos binários do Prisma estava bloqueado no ambiente de desenvolvimento; em máquina normal use `npm run db:migrate` (não testado fora desse ambiente).
- Interface testada apenas no Chromium (desktop e 390 px); sem auditoria com leitor de tela.
- Fora do escopo deste módulo (não implementado): RF02–RF14 (sistemas técnicos, inspeções, ocorrências, laudos, planos, dashboards, gestão de usuários).

