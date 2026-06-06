O código da nossa API em Node.js já está pronto e testado. Ela vai servir como a nossa ponte segura para conectar o seu App em React Native ao banco de dados PostgreSQL do Diogo.

Siga este passo a passo na sua máquina para colocar o servidor local para rodar:

Passo 1: Preparar a pasta do projeto
Crie uma pasta exclusiva para a API no seu computador (ex: sisouve-api).

Abra o seu VS Code nessa pasta.

Abra o terminal integrado do VS Code e inicialize o Node rodando:

Bash
npm init -y
Passo 2: Instalar as dependências do ecossistema
No mesmo terminal, execute o comando abaixo para baixar as ferramentas que o código utiliza (express para as rotas, pg para falar com o Postgres e cors para liberar o acesso ao app móvel):

Bash
npm install express pg cors
Passo 3: Salvar e configurar o código da API
Crie um arquivo chamado api.js dentro da pasta.

Cole o código completo da API que te mandei dentro desse arquivo.

Atenção (Alinhamento com o Diogo): Na linha 16, substitua os valores do objeto pool com as credenciais reais do PostgreSQL que o Diogo criou (user, password, etc.).

Passo 4: Inicializar o Servidor
Com tudo configurado, execute o comando no terminal para ligar o backend:

Bash
node api.js
Se tudo estiver certo, você verá a mensagem: "API do SisOuve rodando com sucesso na porta 3000".

Como consumir as rotas dentro do seu React Native
Com a API rodando na porta 3000, você já pode fazer as requisições HTTP (usando fetch ou axios) de dentro do aplicativo.

DICA CHAVE: Como você vai testar no emulador Android ou em um celular físico conectado na mesma rede Wi-Fi, não use localhost nas URLs das requisições, senão o celular não vai achar o servidor. Descubra o IP local da máquina onde a API está rodando (ex: 192.168.1.50) e monte as URLs assim:

Para cadastrar uma nova manifestação (Tela de Envio):

URL: POST http://<IP_DO_COMPUTADOR>:3000/manifestacoes

Corpo da Requisição (JSON):

JSON
{
  "tipo": "Reclamação",
  "categoria": "Saneamento",
  "relato": "Buraco na via principal impedindo o trânsito."
}
O que a API devolve: Um status 201 com a confirmação e o número de protocolo gerado na hora (ex: "protocolo": "OUV1716945600000").

Para consultar o andamento (Tela de Busca por Protocolo):

URL: GET http://<IP_DO_COMPUTADOR>:3000/manifestacoes/OUV1716945600000

O que a API devolve: Os dados completos contendo o status (Pendente, Em Andamento, Concluído) e a resposta_orgao para você desenhar na tela do celular do cidadão.
