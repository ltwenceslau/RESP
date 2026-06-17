# NEXUS Sistema de Gestao de Faccao

Sistema para controle de uma faccao de costura, com versoes em web estatica, Django e Python desktop.

## O que existe neste repositorio

- `programa montado/`: versao web estatica em HTML, CSS e JavaScript. Pode ser aberta direto no navegador.
- `sistema_faccao/`: versao web em Django.
- `sistema_faccao_python/`: versao desktop em Python com Tkinter e SQLite.
- `documentacao-projeto/`: documentacao dos modulos financeiro, operacao e estoque.
- `modulo de cadastro/`: documentacao e codigo do modulo de cadastro.

## Versao mais simples para usar no GitHub Pages

O GitHub Pages abre automaticamente o arquivo `index.html` da raiz do repositorio. Por isso, esta versao ja esta preparada para funcionar direto pelo link:

```text
https://SEU_USUARIO.github.io/NOME_DO_REPOSITORIO/
```

A raiz contem:

- `index.html`: tela principal.
- `app.css`: estilos.
- `app.js`: logica do sistema.

Essa versao usa armazenamento no proprio navegador (`localStorage`). Os dados cadastrados em um computador/celular ficam naquele navegador, a menos que voce use a funcao de backup/importacao.

## Rodar a versao Django

```bash
cd sistema_faccao
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Depois acesse:

- Sistema: http://127.0.0.1:8000/
- Admin: http://127.0.0.1:8000/admin/

Antes de colocar em producao, copie `.env.example` para `.env` e ajuste `DJANGO_SECRET_KEY`, `DJANGO_DEBUG` e `DJANGO_ALLOWED_HOSTS`.

## Rodar a versao Python desktop

```bash
cd sistema_faccao_python
python app.py
```

O banco local `sistema_faccao.db` e criado automaticamente e nao deve ser enviado ao GitHub.

## Cuidados antes de publicar no GitHub

Este repositorio ja inclui um `.gitignore` para deixar fora:

- bancos locais (`*.db`, `db.sqlite3`);
- ambientes virtuais (`.venv/`, `venv/`);
- caches Python (`__pycache__/`, `*.pyc`);
- arquivos compactados (`*.zip`);
- instaladores e binarios (`*.exe`, `*.winmd`);
- arquivos de configuracao local (`.env`).

As senhas `admin/1234`, `gerente/1234` e `operador/1234` na versao web estatica sao apenas dados iniciais de demonstracao. Troque-as antes de usar com dados reais.

## Como subir no GitHub

Com Git instalado:

```bash
git init
git add .
git commit -m "Publica versao inicial do sistema"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/NOME_DO_REPOSITORIO.git
git push -u origin main
```

Depois, no GitHub:

1. Abra o repositorio.
2. Entre em `Settings`.
3. Entre em `Pages`.
4. Em `Build and deployment`, escolha `Deploy from a branch`.
5. Em `Branch`, selecione `main` e a pasta `/root`.
6. Salve e aguarde o link do GitHub Pages ficar pronto.

Se usar o upload manual pelo site do GitHub, nao envie arquivos ignorados pelo `.gitignore`, especialmente `.exe`, `.zip`, `.db`, `.env` e pastas `__pycache__`.

## Licenca

MIT. Veja `LICENSE`.
