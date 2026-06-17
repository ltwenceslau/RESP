# Reposição de estoque para GitHub Pages

Esta é a versão estática do sistema. Ela não usa backend, banco de dados, Python ou FastAPI, porque o GitHub Pages só hospeda arquivos estáticos.

O processamento dos arquivos acontece no navegador do usuário. Os arquivos enviados não são transferidos para servidor.

## Como publicar

Opção simples:

1. Crie um repositório no GitHub.
2. Envie estes arquivos para a raiz do repositório:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `.nojekyll`
3. No GitHub, abra `Settings > Pages`.
4. Em `Build and deployment`, selecione `Deploy from a branch`.
5. Escolha a branch `main` e a pasta `/root`.
6. Salve e aguarde o link do GitHub Pages.

## Arquivos aceitos

O sistema aceita `PDF`, `XLSX`, `XLSM` e `CSV`.

Para PDFs, o arquivo precisa ter texto/tabelas extraíveis. PDF escaneado como imagem deve ser convertido para CSV ou XLSX antes do upload.

## Entradas

### 1. Estoque de malha

| Cor | Quantidade |
| --- | --- |
| Azul Marinho | 20 |
| Off White | 12 |

Se a coluna `Quantidade` não existir, toda cor listada será considerada disponível.

### 2. Estoque atual do site

Formato longo:

| Cor | Tamanho | Estoque |
| --- | --- | --- |
| Azul Marinho | P | 2 |
| Azul Marinho | XG | 1 |

Formato em grade:

| Cor | P | M | G | XG |
| --- | --- | --- | --- | --- |
| Azul Marinho | 2 | 4 | 1 | 1 |

`XG` é tratado como `G1`.

### 3. Meta por tamanho

Formato longo:

| Tamanho | Meta |
| --- | --- |
| P | 4 |
| M | 4 |
| G1 | 3 |

Formato em grade:

| P | M | G | G1 |
| --- | --- | --- | --- |
| 4 | 4 | 4 | 3 |

### 4. Cores bloqueadas

| Cor |
| --- |
| Verde Militar |
| Rosa Seco |

## Regra

Para cada cor que existe no site, possui malha disponível e não está bloqueada:

```text
reposicao = max(meta_por_tamanho - estoque_atual_no_site, 0)
```

Cores que não existem no site, cores sem malha disponível e cores bloqueadas ficam fora da reposição.

## Saída

O arquivo baixado é uma planilha `.xlsx` com as abas:

| Aba | Conteúdo |
| --- | --- |
| `Resumo` | Totais principais. |
| `Reposicao` | Somente linhas com reposição maior que zero. |
| `Grade por cor` | Reposição consolidada por cor e tamanho. |
| `Auditoria` | Todas as combinações calculadas. |
| `Excluidas` | Cores filtradas e motivo da exclusão. |
