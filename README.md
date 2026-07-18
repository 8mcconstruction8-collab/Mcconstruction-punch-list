# Rounds

by MC Construction & Improvement

Mobile-friendly punch-list PWA built with Next.js and Firebase.

## Features

- Contractor account (real Firebase email/password login) creates projects.
  Customer name/email/address are optional at creation time — leave them
  blank to generate a link the customer fills in themselves on first open
  (handy for customers with more than one job site)
- Contractor dashboard: search projects by customer name/address, see
  progress % per project
- Customer opens the project via a shared link — no account needed
- Customer adds individual punch-list items (title, description, room,
  category, priority) and photos
- Contractor assessment field, status (Open / In progress / Completed)
- Contractor completion photos
- Contractor can close a punch list — customer can still view it, but can no
  longer add items or photos (enforced in Firestore rules, not just the UI)
- Contractor can permanently delete a project from the dashboard — removes
  every item, every photo in Storage, and the project itself. No undo.
- Final report page (`/project/[id]/report`) with before/after photos per
  item, contractor evaluation, and on-screen signature capture for both
  customer and contractor — "Generate PDF" uses the browser's print dialog
  ("Save as PDF"), no extra service required
- Live updates through Firestore
- Change history per item (status changes, evaluation updates, photo
  additions) — visible from a "History" toggle on each item card
- Installable PWA: real icons, offline fallback page, and a service worker
  that caches the app shell (data itself still requires a connection)

## 1. Install

```bash
npm install
```

## 2. Firebase setup

1. Create a Firebase project.
2. Add a Web App, copy the config into `.env.local` (based on `.env.local.example`).
3. Authentication > Sign-in method: enable **Anonymous** (for customers) and
   **Email/Password** (for the contractor).
4. Create a Firestore database.
5. Enable Firebase Storage.

## 3. Publish rules

Copy `firestore.rules` into Firestore Rules and `storage.rules` into Storage Rules.

`storage.rules` checks the contractor status against Firestore data. The
first time you publish it, Firebase will show a one-time prompt asking to
grant Storage permission to read Firestore ("cross-service rules") — accept
it, or deleting projects won't be able to remove their photos.

The dashboard's project list (Firestore console → Indexes, or `firebase deploy
--only firestore:indexes` if you use the CLI) needs the composite index
described in `firestore.indexes.json` (`contractorUid` + `createdAt`). If you
skip this, the first dashboard load will show an error in the browser console
with a direct link to auto-create it — just click it.

## 4. Create the first contractor account

There is no public sign-up screen for contractors — accounts are provisioned by
you, on purpose, so a stranger can never grant themselves contractor access.

1. Firebase console → Authentication → Add user → enter your email/password.
2. Copy the new user's UID.
3. Firestore console → start collection `contractors` → document ID = that UID →
   any single field, e.g. `{ addedAt: <timestamp> }`. The document just needs to
   exist; its content isn't read.

That account can now log in at `/login` and will land in the contractor dashboard.
Repeat for each teammate who needs contractor access.

## 5. Run locally

```bash
npm run dev
```

Open http://localhost:3000 — you'll be sent to `/login`.

## 6. Deploy

The easiest options are Vercel for Next.js and Firebase for database/storage.

## Security notes

- The contractor PIN from earlier versions is gone. Contractor access is now a
  real Firebase Auth account, checked both in the UI and in `firestore.rules` /
  `storage.rules` — a customer can no longer edit the assessment or status by
  calling the Firestore API directly.
- Customers never sign up; opening a project link signs them in anonymously.
  They can only *fetch* a project if they already know its ID (the link) —
  Firestore rules block anonymous users from *listing* the `projects`
  collection, so a customer can't enumerate other people's projects.
- Firebase Storage download URLs carry their own access token once generated;
  by design, a URL you've already shared stays fetchable even if you later
  tighten `storage.rules`. Treat completion/customer photo links as
  effectively permanent once shared.

## Notificações por e-mail

Quando um cliente/manager adiciona um item, adiciona uma foto, ou preenche
os dados dele pela primeira vez, você recebe um e-mail avisando — sem
precisar de servidor próprio, usando a extensão oficial do Firebase
**"Trigger Email"**.

### Configurar (uma vez só)

1. Firebase console → **Extensions** → **Explore Marketplace** → procure
   **"Trigger Email"** (da própria Firebase) → **Install**.
2. Durante a instalação, ele vai pedir uma **conexão SMTP** — o jeito mais
   simples é usar o Gmail:
   - Ative a verificação em duas etapas na conta Google que vai enviar os
     e-mails (se ainda não tiver).
   - Gere uma **"senha de app"** em myaccount.google.com → Segurança →
     Senhas de app.
   - Use essa senha (não a senha normal da conta) na configuração da
     extensão, formato: `smtps://SEU_EMAIL%40gmail.com:SENHA_DE_APP@smtp.gmail.com:465`
3. Em **"Collection path"**, use exatamente: `mail` (é o nome que o código
   já espera).
4. Termine a instalação.
5. Adicione a variável de ambiente no Vercel:
   - `NEXT_PUBLIC_DEFAULT_CONTRACTOR_EMAIL` = o e-mail que deve receber os
     avisos (o mesmo do seu login de contractor).
6. Publique o `firestore.rules` atualizado (tem uma regra nova pra
   coleção `mail`) e faça o redeploy.

### Como funciona / limites

- Cada punch list guarda o e-mail de destino (`contractorNotifyEmail`) no
  momento em que é criada. **Punch lists criadas antes dessa atualização
  não mandam notificação** — só as novas, a partir de agora.
- A regra do Firestore trava o envio: só aceita mandar e-mail pro
  endereço que já está gravado naquele projeto específico — ninguém
  consegue usar o sistema pra mandar e-mail pra outro lugar.
- Eventos que disparam e-mail: novo item, nova foto (só quando quem
  adiciona não é você), e cliente preenchendo os dados dele pela primeira
  vez. Ações suas como contractor nunca geram e-mail pra você mesmo.
- Se um dia você tiver mais de uma conta de contractor, cada uma pode ter
  seu próprio e-mail — mas isso exige guardar o endereço de cada
  contractor em vez de usar uma variável fixa; hoje o sistema assume um
  contractor só.

## Localizações e rodadas (várias punch lists por lugar)

Pra um lugar fixo que recebe **trabalhos separados ao longo do tempo** —
elétrica em junho, hidráulica em agosto, pintura depois — existe o conceito
de **Localização**. Cada localização tem um link fixo que nunca muda; por
baixo dele, cada trabalho vira uma **rodada** independente (com seus
próprios itens, fotos, status, relatório e assinatura).

- No dashboard, seção **"Locations"** → crie uma localização (nome,
  endereço, e opcionalmente um grupo).
- O link gerado (`/location/{id}`) é o que você compartilha — **sempre o
  mesmo**, mesmo quando surgir um trabalho novo ali.
- Se a localização só tem 1 rodada, o link abre direto nela (sem tela
  extra). Assim que existir mais de uma, aparece uma lista simples pra
  escolher — cada uma mostrando se está aberta ou fechada.
- Contractor vê um botão **"Start new round"** na página da localização —
  cria uma rodada nova sem duplicar a localização.
- Rodadas fechadas continuam acessíveis (histórico, relatório, assinatura
  de cada uma) — nada se perde ao abrir uma rodada nova.

**Como isso se conecta com Grupos:** quando uma localização pertence a um
grupo, o dono passa a ver, na visão geral (`/group/{id}`), o progresso
**somatizado de todas as rodadas** daquela localização — e a tela de
managers (`/group/{id}/select`) leva direto pra localização (que por sua
vez decide sozinha se mostra a rodada atual ou a lista de rodadas).

**Migrando grupos antigos:** se um grupo já tinha punch lists ligadas
diretamente (do jeito antigo, antes de existir Localização), aparece um
botão **"Migrate to Locations"** ao lado dele no dashboard. Isso cria uma
localização pra cada punch list existente, marcando-a como "Round 1" —
nada é apagado, é seguro rodar mesmo mais de uma vez.

## Grupos (donos com várias localizações)

Pra clientes com mais de uma obra/unidade (ex.: dono de uma rede de
restaurantes), existe o conceito de **grupo**. Cada grupo gera **dois links,
só isso** — não um por localização:

- No dashboard, crie um grupo com o nome do dono (ex.: "Rossi Hospitality
  Group") e, opcionalmente, e-mail/nome dele.
- Vincule cada **localização** a esse grupo — na hora de criar uma
  localização nova, ou depois, editando ela.
- **Link do dono** (`/group/{id}`) — mostra todas as localizações do grupo
  juntas, com resumo de itens em aberto e % concluída (somando todas as
  rodadas de cada uma).
- **Link dos managers** (`/group/{id}/select`) — o **mesmo link pra todo
  mundo**. Abre uma tela simples, só com os nomes das localizações (sem
  progresso, sem endereço). Cada manager clica na sua e cai na localização
  (que leva direto pra rodada atual, ou pra lista de rodadas se tiver mais
  de uma).
- O dono pode adicionar itens e fotos em qualquer localização do grupo dele
  (mesma permissão de um cliente comum), mas não vê botões de
  encerrar/apagar nem consegue mudar status ou sua avaliação de contractor —
  isso continua exclusivo seu.
- Segurança: nem o dono nem os managers fazem uma busca aberta no banco — o
  app busca cada localização do grupo uma por uma, pelo ID exato salvo no
  documento do grupo. Ninguém enxerga clientes ou grupos de fora do seu,
  nem mesmo tentando manipular a URL. A tela de managers (`/select`) só
  expõe nomes — quem quiser ver o progresso de outra unidade ainda
  precisaria clicar nela deliberadamente; não é uma barreira de segurança
  forte, é só não deixar isso na cara.

## Link fixo para clientes novos

Além do link individual por projeto, existe um link único e fixo em `/start`
— qualquer pessoa que abrir ganha uma punch list nova, criada na hora, e
preenche seus próprios dados (nome, e-mail, endereço) na primeira tela. É
esse o link pra mandar pra clientes novos, sem precisar criar nada antes —
aparece pronto pra copiar no topo do seu dashboard.

Pra habilitar, adicione mais uma variável de ambiente no Vercel:

- `NEXT_PUBLIC_DEFAULT_CONTRACTOR_UID` = o UID da sua conta de contractor
  (Firebase console → Authentication → Users → copie o "User UID" da sua
  conta)

Redeploy depois de adicionar. Sem essa variável configurada, `/start` mostra
uma mensagem de erro em vez de criar o projeto.

## Link previews (WhatsApp/iMessage/etc.)

Add one more environment variable in Vercel (Settings → Environment Variables)
so the shared-link thumbnail shows your logo instead of a blank page:

- `NEXT_PUBLIC_SITE_URL` = your live URL, e.g. `https://mcconstruction-punch-list-xxxx.vercel.app`
  (or your custom domain, once you set one up)

Redeploy after adding it. The preview image lives at `public/brand/og-image.png`
— replace that file any time to change the thumbnail.

## PWA notes

- The service worker only registers in production builds (`npm run build &&
  npm start`, or your deployed site) — it's intentionally skipped in
  `npm run dev` to avoid caching issues while you're developing.
- It caches the app shell and static assets so navigation doesn't hit a raw
  browser error when offline; it shows `offline.html` instead.
- Icons live in `public/icons/`; replace them any time with your own artwork
  at the same file names/sizes.

## Offline behavior

- **Projects/items already opened once are viewable offline.** Firestore
  keeps a local cache (via `persistentLocalCache` in `lib/firebase.ts`), so
  if you or a customer open a punch list while online, it stays readable
  without a connection afterward — including on a fresh app restart.
- A small banner appears at the top of every screen while the device is
  offline (`components/OfflineBanner.tsx`), so it's clear you're looking at
  possibly-stale data instead of the app looking frozen.
- **What this does not cover:** the very first time a link is opened, it
  still needs a connection (nothing to cache yet). Uploading photos always
  requires a live connection — Firebase Storage has no offline queue.
  Firestore *does* queue simple field writes made while offline (like
  toggling an item's status) and sends them once the connection returns,
  but that's a side effect of the cache, not something the UI currently
  surfaces to the user — worth a dedicated "pending sync" indicator later
  if you start relying on it.

## Still ahead

- Emailing on every update (new item, status change, etc.) — would use the
  Firebase "Trigger Email" extension; needs deciding which events actually
  warrant an email so it doesn't turn into spam.
- Offline photo uploads (capture now, upload automatically once back
  online) and a "pending sync" indicator in the UI — the harder half of
  offline support, deliberately left out of this round.
