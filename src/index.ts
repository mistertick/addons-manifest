export interface Env {
  GITHUB_PAT: string
  GITHUB_OWNER?: string
  GITHUB_REPO?: string
}

function extractGitHubInfo(urlStr: string): { owner: string; repo: string } | null {
  try {
    const url = new URL(urlStr)
    // raw.githubusercontent.com/<owner>/<repo>/<branch>/...
    if (url.hostname === 'raw.githubusercontent.com') {
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length >= 2) {
        return { owner: parts[0], repo: parts[1] }
      }
    }
    // github.com/<owner>/<repo>/raw/<branch>/...
    if (url.hostname === 'github.com') {
      const parts = url.pathname.split('/').filter(Boolean)
      if (parts.length >= 2) {
        return { owner: parts[0], repo: parts[1] }
      }
    }
    return null
  } catch {
    return null
  }
}

function extractYamlField(yaml: string, field: string): string | null {
  const regex = new RegExp(
    `^\\s*${field}\\s*:\\s*(?:['"]?)([^'"\\r\\n]+?)(?:['"]?)\\s*$`,
    'm',
  )
  const match = yaml.match(regex)
  if (!match) {
    return null
  }
  return match[1].trim()
}

function isObjectRecord(value: object | null | undefined): value is object {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readOptionalStringProp(obj: object, key: string): string | undefined {
  const entries = Object.entries(obj)
  for (const [entryKey, entryVal] of entries) {
    if (entryKey === key && typeof entryVal === 'string') {
      return entryVal
    }
  }
  return undefined
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Health check endpoint
    if (request.method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'Mr. Tick Addons Marketplace Registry Worker',
          timestamp: new Date().toISOString(),
          version: '1.1.0-secure',
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 405,
      })
    }

    try {
      if (!env.GITHUB_PAT) {
        return new Response(
          JSON.stringify({
            error:
              'GITHUB_PAT não configurado nas Environment Variables do Cloudflare Worker.',
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 500 },
        )
      }

      const rawBody: object | null = await request.json()
      let rawAddonId: string | undefined = undefined
      let manifestUrl: string | undefined = undefined
      if (isObjectRecord(rawBody)) {
        const addonIdCandidate = readOptionalStringProp(rawBody, 'addonId')
        if (addonIdCandidate) {
          rawAddonId = addonIdCandidate.trim()
        }
        const manifestUrlCandidate = readOptionalStringProp(
          rawBody,
          'manifestUrl',
        )
        if (manifestUrlCandidate) {
          manifestUrl = manifestUrlCandidate.trim()
        }
      }

      if (!rawAddonId || !manifestUrl) {
        return new Response(
          JSON.stringify({
            error: 'addonId e manifestUrl são campos obrigatórios.',
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 400 },
        )
      }

      // Sanitização de segurança do ID (apenas letras, números, _ e -)
      const addonId = rawAddonId.replace(/[^a-zA-Z0-9_-]/g, '')
      if (!addonId) {
        return new Response(
          JSON.stringify({ error: 'addonId com formato inválido.' }),
          { headers: { 'Content-Type': 'application/json' }, status: 400 },
        )
      }

      // 🔒 SEGURANÇA 1: Extração e validação do repositório GitHub de origem
      const ghInfo = extractGitHubInfo(manifestUrl)
      if (!ghInfo) {
        return new Response(
          JSON.stringify({
            error:
              'manifestUrl inválida: deve apontar para uma URL raw oficial do GitHub (ex: https://raw.githubusercontent.com/usuario/repo/main/manifest.yaml).',
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 400 },
        )
      }

      // 🔒 SEGURANÇA 2: Namespace Lock (addonId deve obrigatoriamente iniciar com o username/org do GitHub)
      const expectedPrefix = `${ghInfo.owner.toLowerCase()}-`
      if (!addonId.toLowerCase().startsWith(expectedPrefix)) {
        return new Response(
          JSON.stringify({
            error: `Namespace inválido: o addonId '${addonId}' deve iniciar com o prefixo obrigatório '${expectedPrefix}' baseado no autor '${ghInfo.owner}'.`,
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 403 },
        )
      }

      // 1. Faz o download do manifest.yaml a partir da URL oficial do repositório
      const isOfficialMisterTick = ghInfo.owner.toLowerCase() === 'mistertick'
      const manifestHeaders: Record<string, string> = {
        'User-Agent': 'Mistertick-Addons-Registry-Worker',
      }
      if (isOfficialMisterTick) {
        manifestHeaders.Authorization = `Bearer ${env.GITHUB_PAT}`
      }

      let manifestRes = await fetch(manifestUrl, { headers: manifestHeaders })
      if (!manifestRes.ok && isOfficialMisterTick) {
        const ghApiRawUrl = `https://api.github.com/repos/${ghInfo.owner}/${ghInfo.repo}/contents/manifest.yaml`
        manifestRes = await fetch(ghApiRawUrl, {
          headers: {
            Authorization: `Bearer ${env.GITHUB_PAT}`,
            'User-Agent': 'Mistertick-Addons-Registry-Worker',
            Accept: 'application/vnd.github.v3.raw',
          },
        })
      }

      if (!manifestRes.ok) {
        return new Response(
          JSON.stringify({
            error: `Não foi possível baixar o manifesto de: ${manifestUrl} (HTTP ${manifestRes.status})`,
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 400 },
        )
      }

      const manifestContent = await manifestRes.text()
      if (!manifestContent || manifestContent.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: 'O manifesto baixado está vazio.' }),
          { headers: { 'Content-Type': 'application/json' }, status: 400 },
        )
      }

      // 🔒 SEGURANÇA 3: Validação da integridade interna do manifesto
      const yamlId = extractYamlField(manifestContent, 'id')
      if (yamlId && yamlId.toLowerCase() !== addonId.toLowerCase()) {
        return new Response(
          JSON.stringify({
            error: `Inconsistência no manifesto: o id no arquivo YAML ('${yamlId}') não coincide com o addonId ('${addonId}').`,
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 400 },
        )
      }

      const downloadUrl = extractYamlField(manifestContent, 'downloadUrl')
      if (!downloadUrl) {
        return new Response(
          JSON.stringify({
            error:
              'Manifesto inválido: campo obrigatório downloadUrl não encontrado.',
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 400 },
        )
      }

      // Validação de domínio de download (release pública .tladdon OU rota Plus oficial para org mistertick)
      const expectedReleasePrefix =
        `https://github.com/${ghInfo.owner}/${ghInfo.repo}/releases/download/`.toLowerCase()
      const expectedPlusPrefix = `https://mistertick-api.mistertick.workers.dev/catalog/plus-addons/${addonId.toLowerCase()}/versions/`
      const lowerDownloadUrl = downloadUrl.toLowerCase()
      const isValidGithubRelease =
        lowerDownloadUrl.startsWith(expectedReleasePrefix) &&
        lowerDownloadUrl.endsWith('.tladdon')
      const isValidPlusDownload =
        isOfficialMisterTick &&
        lowerDownloadUrl.startsWith(expectedPlusPrefix) &&
        (lowerDownloadUrl.endsWith('/download') ||
          lowerDownloadUrl.endsWith('/download.tladdon'))

      if (!isValidGithubRelease && !isValidPlusDownload) {
        return new Response(
          JSON.stringify({
            error: `downloadUrl não autorizada: o binário deve ser uma release oficial hospedada em '${expectedReleasePrefix}...' (.tladdon) ou uma rota Plus oficial da org mistertick.`,
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 400 },
        )
      }

      let owner = 'mistertick'
      if (env.GITHUB_OWNER && env.GITHUB_OWNER.trim().length > 0) {
        owner = env.GITHUB_OWNER.trim()
      }
      let repo = 'addons-manifest'
      if (env.GITHUB_REPO && env.GITHUB_REPO.trim().length > 0) {
        repo = env.GITHUB_REPO.trim()
      }
      const filePath = `addons/${addonId}.yaml`
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`

      // 2. Consulta se o arquivo já existe no catálogo
      let fileSha: string | undefined = undefined
      const checkFileRes = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${env.GITHUB_PAT}`,
          'User-Agent': 'Mistertick-Addons-Registry-Worker',
          Accept: 'application/vnd.github.v3+json',
        },
      })

      if (checkFileRes.ok) {
        const rawFileJson: object | null = await checkFileRes.json()
        let existingContent: string | undefined = undefined
        if (isObjectRecord(rawFileJson)) {
          fileSha = readOptionalStringProp(rawFileJson, 'sha')
          existingContent = readOptionalStringProp(rawFileJson, 'content')
        }

        // 🔒 SEGURANÇA 4: Source Repository Lock (Prevenção de Sequestro / Addon Hijacking)
        if (existingContent) {
          try {
            const existingYaml = atob(existingContent.replace(/\s/g, ''))
            const existingSourceUrl = extractYamlField(
              existingYaml,
              'sourceUrl',
            )
            if (existingSourceUrl) {
              const existingGh = extractGitHubInfo(existingSourceUrl)
              if (existingGh) {
                const incomingRepo =
                  `${ghInfo.owner}/${ghInfo.repo}`.toLowerCase()
                const existingRepo =
                  `${existingGh.owner}/${existingGh.repo}`.toLowerCase()
                if (incomingRepo !== existingRepo) {
                  return new Response(
                    JSON.stringify({
                      error: `Acesso negado (Source Repository Lock): o addon '${addonId}' pertence ao repositório '${existingGh.owner}/${existingGh.repo}' e não pode ser sobrescrito por '${ghInfo.owner}/${ghInfo.repo}'.`,
                    }),
                    {
                      headers: { 'Content-Type': 'application/json' },
                      status: 403,
                    },
                  )
                }
              }
            }
          } catch {
            // Em caso de falha no decode, prossegue
          }
        }
      }

      // Converte o conteúdo do YAML para Base64 (suportando caracteres UTF-8)
      const utf8Bytes = new TextEncoder().encode(manifestContent)
      let binaryString = ''
      for (let i = 0; i < utf8Bytes.length; i++) {
        binaryString += String.fromCharCode(utf8Bytes[i])
      }
      const base64Content = btoa(binaryString)

      // 3. Grava / Atualiza o arquivo direto na branch main
      const commitRes = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${env.GITHUB_PAT}`,
          'User-Agent': 'Mistertick-Addons-Registry-Worker',
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `chore(store): auto-publish addon ${addonId}`,
          content: base64Content,
          branch: 'main',
          sha: fileSha,
        }),
      })

      if (!commitRes.ok) {
        const errDetails = await commitRes.text()
        return new Response(
          JSON.stringify({
            error: 'Erro ao commitar no repositório GitHub',
            details: errDetails,
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 500 },
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Addon ${addonId} publicado com sucesso no repositório ${owner}/${repo}!`,
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      )
    } catch (err) {
      let details = String(err)
      if (err instanceof Error) {
        details = err.message
      }
      return new Response(
        JSON.stringify({
          error: 'Erro interno no Worker',
          details,
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 500 },
      )
    }
  },
}
