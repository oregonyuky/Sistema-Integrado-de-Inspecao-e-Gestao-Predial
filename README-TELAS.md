# O que cada tela faz

Guia das telas do SIIGP (RF01 e MOD-02). Todas exigem login. Perfis: **Administrador** (tudo), **Editor** (cadastra e edita; não desativa itens do catálogo) e **Leitor** (somente consulta). Itens nunca são apagados: são **desativados** e continuam consultáveis.

Menu lateral: Empreendimentos · Clientes · Catálogo técnico · Normas · Manifestações · Responsáveis.

---

## Parte 1 — Empreendimentos (RF01)

| Tela | Para que serve | Imagem |
|---|---|---|
| **Login** | Entrada com e-mail e senha; bloqueia tentativas repetidas. | ![](docs/screenshots/01-login.png) |
| **Empreendimentos (lista)** | Busca, filtra e abre empreendimentos; cria novo. | ![](docs/screenshots/02-empreendimentos.png) |
| **Clientes** | Cadastro de clientes (PF/PJ) com validação de campos. | ![](docs/screenshots/03-clientes.png) |
| **Formulário de empreendimento** | Cria/edita dados cadastrais, endereço e anexos. | ![](docs/screenshots/06-empreendimento-formulario.png) |
| **Visão geral** | Resumo do empreendimento e contagens. | ![](docs/screenshots/05-visao-geral.png) |
| **Estrutura física** | Árvore edifício → pavimento → ambiente; cria, edita, move e desativa locais. | ![](docs/screenshots/07-estrutura-fisica.png) |
| **Responsáveis** | Vincula responsáveis com período de vigência. | ![](docs/screenshots/09-responsaveis.png) |
| **Histórico** | Linha do tempo de alterações do empreendimento. | ![](docs/screenshots/10-historico.png) |

---

## Parte 2 — Catálogo técnico e sistemas prediais (MOD-02)

### Catálogo técnico (`/catalogo`) — RF-011, 013, 015, 016, 017, 019, 020
![Catálogo](docs/screenshots/mod02-catalogo.png)
Biblioteca mestre da organização, em árvore **Sistema → Subsistema → Tipo de componente** (o tipo pode ficar direto sob o sistema).
- **Buscar** por nome/código; **Expandir tudo / Recolher**; **Mostrar inativos**.
- **Novo sistema / subsistema / tipo**, **Editar / mover** (as referências existentes são preservadas).
- **Desativar / Reativar** (só Administrador): o item e o que está abaixo dele somem dos novos cadastros, mas componentes, critérios e vínculos já existentes continuam consultáveis.
- Aba **Critérios de inspeção** (só em tipos): perguntas que formam o formulário de inspeção do tipo — respostas Conforme/Não conforme, Sim/Não, Número (unidade, mín., máx.), Texto ou Escolha única; reordenar (↑ ↓), editar, desativar.
  ![Novo critério](docs/screenshots/mod02-criterio-modal.png)
- Aba **Normas aplicáveis**: normas/seções vinculadas ao item; as vinculadas ao sistema ou subsistema acima aparecem como "herdadas".
  ![Normas do item](docs/screenshots/mod02-catalogo-normas.png)

### Normas (`/normas`) — RF-019
![Normas](docs/screenshots/mod02-normas.png)
Biblioteca normativa: **Norma → Edições (uma "Vigente") → Seções**. Cria, edita, desativa/reativa cada nível; mostra quantos itens do catálogo usam cada seção. O resumo da seção é texto próprio do usuário.

### Manifestações (`/manifestacoes`) — RF-021
![Manifestações](docs/screenshots/mod02-manifestacoes.png)
Duas abas distintas: **Manifestações** (o que se observa: fissura, corrosão, infiltração…, com causas típicas) e **Classificações técnicas** (como qualificar: gravidade, origem, risco, urgência). Uma manifestação pode ser relacionada a várias classificações.
![Classificações](docs/screenshots/mod02-classificacoes.png)

### Empreendimento › Sistemas — RF-018
![Sistemas](docs/screenshots/mod02-sistemas.png)
Seleciona, entre os sistemas do catálogo, os que existem naquele empreendimento. Mostra quantos componentes ativos cada um tem. Remover a seleção é bloqueado enquanto houver componentes ativos do sistema.

### Empreendimento › Componentes — RF-012, 014, 015, 016, 017
![Componentes](docs/screenshots/mod02-componentes.png)
Lista com busca (nome, plaqueta, ID, nº de série) e filtros por sistema, tipo e situação. **Novo componente**:
![Novo componente](docs/screenshots/mod02-componente-modal.png)
- O **tipo** só oferece tipos ativos de sistemas selecionados no empreendimento e **não muda depois**.
- O **local** vem da estrutura física do mesmo empreendimento.
- Cada componente recebe um **ID único e imutável** (`CMP-000001`, gerado pelo banco).

### Detalhe do componente — RF-016, 020, 019, 022 (parcial)
![Detalhe](docs/screenshots/mod02-componente-detalhe.png)
Dados do componente, local completo, **formulário de inspeção do tipo** (prévia), **normas aplicáveis** (inclui herdadas) e **histórico** de alterações de cadastro. ⚠️ Inspeções e ocorrências ainda não existem no sistema, então o histórico (RF-022) mostra só o cadastro e a tela avisa isso.

### No celular
![Catálogo no celular](docs/screenshots/mod02-mobile-catalogo.png)
As telas se adaptam a 390 px de largura (sem rolagem horizontal da página, verificado).
