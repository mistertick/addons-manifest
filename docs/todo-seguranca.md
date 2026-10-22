# Controles de publicação do catálogo

Este registro descreve os controles presentes em [src/index.ts](../src/index.ts). Ele substitui a lista antiga de tarefas que tratava esses controles como não implementados. A leitura do código não substitui uma auditoria de segurança nem confirma a configuração do serviço em produção.

## Controles presentes

- O serviço extrai o autor e o repositório da URL do manifesto no GitHub.
- O ID do addon deve começar com o nome desse autor ou organização, seguido de `-`.
- Quando o manifesto informa um `id`, ele deve corresponder ao ID enviado na solicitação.
- O download deve apontar para um arquivo `.tladdon` em uma Release do mesmo repositório. Addons oficiais da organização `mistertick` também podem usar a rota Plus autorizada da API.
- Nas atualizações, o serviço consulta o registro existente. Quando seu `sourceUrl` identifica um repositório do GitHub, rejeita uma origem diferente.

## Limites e verificações pendentes

- A checagem da origem existente depende de um `sourceUrl` reconhecido. O código não mantém uma chave imutável `ownerRepo` independente desse campo.
- A validação do endereço de download não comprova o conteúdo do pacote, sua assinatura, checksum ou correspondência entre versão e tag.
- O controle de download não deve ser descrito como uma validação de `iconUrl`.
- O serviço grava diretamente no catálogo; este caminho não implementa aprovação por pull request.
- Confirmar a cobertura automatizada desses casos antes de encerrar uma auditoria de segurança.

Esses limites descrevem o comportamento observado no código. Não são evidência, por si só, de uma exploração reproduzida.
