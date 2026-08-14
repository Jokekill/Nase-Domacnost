# Nasazení

Cíl: Raspberry Pi 5 s Dockerem, přístupné jen přes Tailscale, HTTPS zajišťuje
`tailscale serve`. Stejný obraz běží i na notebooku (amd64).

## 1. Co je potřeba na Pi

- Raspberry Pi OS 64bit (arm64 — obraz pro 32bit systém neexistuje)
- Docker Engine + plugin compose (`curl -fsSL https://get.docker.com | sh`,
  pak `sudo usermod -aG docker $USER` a znovu se přihlásit)
- Tailscale (`curl -fsSL https://tailscale.com/install.sh | sh`)
- SD karta stačí, ale databáze i fotky patří radši na SSD — viz §6

## 2. Sestavení obrazu pro obě architektury

Obraz se staví na výkonnějším stroji a na Pi se jen stáhne. Build přímo na Pi
je taky možný, ale trvá desítky minut.

```bash
docker buildx create --name domacnost --use   # jednou
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/<uzivatel>/nase-domacnost:1.0.0 \
  -t ghcr.io/<uzivatel>/nase-domacnost:latest \
  --push .
```

`--push` je povinný: multi-arch manifest nejde uložit do lokálního démona
(`--load` umí jen jednu architekturu). Bez registru se dá obraz přenést i
souborem:

```bash
docker buildx build --platform linux/arm64 -t nase-domacnost:1.0.0 --load .
docker save nase-domacnost:1.0.0 | gzip | ssh pi@pi "gunzip | docker load"
```

Pozn.: `pnpm install` v obrazu běží s `--config.minimumReleaseAge=0`, protože
instaluje přesně to, co je v zamčeném `pnpm-lock.yaml` (viz komentář
v Dockerfile).

## 3. Konfigurace na Pi

```bash
git clone <repo> ~/domacnost && cd ~/domacnost
cp .env.example .env
```

V `.env` nastav:

| Proměnná | Hodnota na Pi |
| --- | --- |
| `APP_IMAGE` | `ghcr.io/<uzivatel>/nase-domacnost:1.0.0` |
| `POSTGRES_PASSWORD` | něco dlouhého a náhodného, **ne** výchozí |
| `DEV_INSECURE_COOKIES` | `false` (HTTPS zajišťuje Tailscale) |
| `PUBLIC_SHARING_ENABLED` | `false`, dokud veřejné odkazy nechceš |
| `UPLOADS_HOST_DIR` | `/srv/domacnost/uploads` |
| `BACKUPS_HOST_DIR` | `/srv/domacnost/backups` |
| `BACKUP_HOUR` | `03` |

`DATABASE_URL` v `.env` je jen pro nástroje na hostu; kontejnery si ji skládají
v compose samy (`db:5432`).

## 4. První spuštění

```bash
docker compose pull                      # nebo docker compose build
docker compose up -d db backup
docker compose run --rm migrate          # schéma
docker compose up -d app
curl -s localhost:3000/api/health        # {"status":"ok","db":"ok"}
```

Databáze je prázdná — první registrace v aplikaci založí domácnost a udělá
z prvního uživatele správce. Katalog potravin, kategorie a šablony úklidu se
naplní automaticky při založení domácnosti.

Obnova ze zálohy místo prázdného startu: viz §7.

## 5. HTTPS a přístup přes Tailscale

Aplikace poslouchá jen na `127.0.0.1:3000`, ven ji pustí Tailscale:

```bash
sudo tailscale up
sudo tailscale serve --bg 3000
sudo tailscale status            # ukáže https://<jmeno>.<tailnet>.ts.net
```

HTTPS není kosmetika — bez secure contextu nefunguje service worker (offline
režim), instalace na plochu, Wake Lock v režimu vaření ani skener čárových kódů
(D-003). `tailscale serve` dodá skutečný certifikát, takže PWA se instaluje
i na telefonu.

Nic se nevystavuje do internetu: kdo není v tailnetu, nedostane se nikam. Pro
sdílení veřejného odkazu na recept (za flagem) by bylo potřeba `tailscale
funnel` — vědomé rozhodnutí, které tenhle návod nedělá.

## 6. Data na disku

| Cesta | Co to je | Kdo to zálohuje |
| --- | --- | --- |
| docker volume `db_data` | Postgres | `pg_dump` v sidecaru |
| `${UPLOADS_HOST_DIR}` | fotky receptů | tar v sidecaru |
| `${BACKUPS_HOST_DIR}` | hotové zálohy | **kopie mimo Pi je na tobě** |

Zálohovací sidecar běží pořád a jednou denně (`BACKUP_HOUR`) udělá dump
databáze a tar fotek, retence 7 denních / 4 týdenní / 12 měsíčních. Stav je
vidět v Nastavení → Zálohy, ruční spuštění tamtéž. Zálohy leží na hostu jako
obyčejné soubory — zkopírovat je jinam (druhý disk, NAS) je poslední krok,
který za tebe nikdo neudělá.

## 7. Obnova ze zálohy na čistou instalaci

```bash
docker compose up -d db
gunzip -c /srv/domacnost/backups/daily/domacnost-2026-08-14.dump.gz \
  | docker compose exec -T db pg_restore -U domacnost -d domacnost --clean --if-exists
tar -xzf /srv/domacnost/backups/daily/uploads-2026-08-14.tar.gz -C /srv/domacnost
docker compose run --rm migrate
docker compose up -d app
```

Druhá cesta je export/import ZIP z Nastavení → Data (docs/EXPORT-FORMAT.md).
Ten je vhodnější na přenos mezi instalacemi, `pg_restore` na havárii.

## 8. Aktualizace

```bash
cd ~/domacnost && git pull
docker compose pull                # nový obraz z registru
docker compose run --rm migrate    # migrace VŽDY před startem nové verze
docker compose up -d app
```

Migrace nikdy nepouští aplikace sama při startu — jinak by si dva kontejnery
mohly skočit do řeči. Zpětný krok: `docker compose up -d app` s předchozím
tagem obrazu; migrace jsou dopředné, takže návrat o verzi zpět předpokládá
obnovu ze zálohy, pokud migrace měnila data.

## 9. Když něco nejde

| Příznak | Kde se dívat |
| --- | --- |
| aplikace nenaběhne | `docker compose logs -f app`, `curl localhost:3000/api/health` |
| „database is not ready" | `docker compose ps` — `db` musí být `healthy` |
| fotky se nenačítají | práva na `${UPLOADS_HOST_DIR}` (v kontejneru běží uid 1001) |
| PWA se nenabízí k instalaci | jde to přes `https://…ts.net`? V DevTools → Application → Service Workers musí být stav `activated` |
| offline nic neukazuje | zrcadlo se plní až po prvním přihlášení online; Nastavení → Synchronizace ukáže frontu i poslední sync |
| záloha stará | Nastavení → Zálohy zvýrazní starší než 48 h; `docker compose logs backup` |
