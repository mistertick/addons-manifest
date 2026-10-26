# 🏪 Mr. Tick Addons Registry

Repositório central do catálogo oficial de Addons (Plugins) para o **Mr. Tick App**.

---

## 🚀 Arquitetura de Publicação Automática (Marketplace Pipeline)

O catálogo recebe os manifestos publicados pelos addons e gera o índice que o aplicativo consulta. O serviço de publicação usa uma credencial própria do GitHub; o desenvolvedor não precisa receber essa credencial.

```text
┌────────────────────────────────┐       ┌────────────────────────────────┐       ┌────────────────────────────────┐
│  📦 Repositório do Dev        │       │  ⚡ Cloudflare Ingestion Worker │       │  🏪 addons-manifest Repo       │
│  (ex: redmine-plugin)          │       │  (mistertick.workers.dev)        │       │  (Este Repositório)            │
│                                │       │                                │       │                                │
│ • Desenvolve com @mr-tick/sdk  │       │ • Recebe POST automático       │       │ • Salva em addons/<id>.yaml    │
│ • Publica versão pelo CI       │──────>│ • Valida e extrai o manifesto  │──────>│ • generate-index.yml compila   │
│ • CI gera release com .tladdon │       │ • Grava direto na branch main  │       │ • index.json atualizado no ar! │
└────────────────────────────────┘       └────────────────────────────────┘       └────────────────────────────────┘
                                                                                              │
                                                                                              ▼
                                                                              ┌────────────────────────────────┐
                                                                              │    💻 Mr. Tick Desktop App     │
                                                                              │  • Lê o index.json remoto      │
                                                                              │  • Exibe nova versão na Loja   │
                                                                              │  • Instalação com 1 clique     │
                                                                              └────────────────────────────────┘
```

---

## 📝 Como Publicar um Addon (Guia Rápido para Desenvolvedores)

### 1. Criar o Projeto
Utilize o repositório de referência oficial como modelo:
👉 **[Gustavohps10/redmine-plugin](https://github.com/Gustavohps10/redmine-plugin)**

### 2. Configurar o Manifesto (`manifest.yaml`)
Na raiz do seu plugin, configure o `manifest.yaml`:

```yaml
id: seuusuario-nomeaddon
name: Nome do Addon
version: 0.1.0
capabilities:
  - dataSource
author: Seu Nome
shortDescription: Resumo curto de 1 linha para a vitrine
description: Descrição completa detalhando recursos do addon
iconUrl: https://raw.githubusercontent.com/seuusuario/seurepo/main/src/icon.png
sourceUrl: https://github.com/seuusuario/seurepo
homepage: https://github.com/seuusuario/seurepo#readme
tags:
  - time-tracking
  - datasource
screenshots:
  - url: https://raw.githubusercontent.com/seuusuario/seurepo/main/screenshots/overview.png
    caption: Tela Principal
downloadUrl: https://github.com/seuusuario/seurepo/releases/download/v0.1.0/seuusuario-nomeaddon-0.1.0.tladdon
requiredApiVersion: '>=0.10.0'
releaseDate: '2026-08-27'
changelog:
  - Versão inicial
packages:
  - version: 0.1.0
    requiredApiVersion: '>=0.10.0'
    releaseDate: '2026-08-27'
    downloadUrl: https://github.com/seuusuario/seurepo/releases/download/v0.1.0/seuusuario-nomeaddon-0.1.0.tladdon
    changelog:
      - Versão inicial
```

### 3. Publicar uma Nova Versão
Use o processo de versão do repositório do addon. Nos addons oficiais, registre mudanças de versão com Changesets; não edite versões nem changelogs manualmente.

O processo de publicação precisa gerar o pacote `.tladdon`, disponibilizá-lo em uma Release do GitHub e enviar a URL do manifesto ao serviço abaixo. Consulte o workflow do addon de referência antes de configurar o seu.

A atualização da vitrine depende da conclusão dos workflows e da próxima consulta do aplicativo ao catálogo. Não há prazo fixo de publicação. Para conhecer as funcionalidades que um addon pode oferecer, consulte o [SDK](https://mistertick.com/pt-br/docs).

---

## 🌐 Endpoint de Ingestão do Catálogo

- **URL:** `https://addons-manifest.mistertick.workers.dev/`
- **Método:** `POST`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "addonId": "seuusuario-nomeaddon",
    "manifestUrl": "https://raw.githubusercontent.com/seuusuario/seurepo/main/manifest.yaml"
  }
  ```

---

## 🛠️ Manutenção do Repositório

- Os arquivos de cada addon vivem individualmente em `addons/<addon-id>.yaml`.
- Toda alteração na pasta `addons/**` dispara o workflow [`.github/workflows/generate-index.yml`](.github/workflows/generate-index.yml), que consolida todos os manifestos no arquivo `index.json` na raiz.

## Authentication capability

SDK 0.11 introduces `auth` for addons that register connection profiles and authenticators. It is independent of `dataSource` and `watcher`; themes without accounts do not declare it. Publish compatible SDK, desktop and addon packages before refreshing the catalog. Never rewrite metadata of an existing package to claim it was rebuilt with the new contract.
