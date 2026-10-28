# OpenCity Frontend — DX-OS Layer 2

OpenCity is an open-source, mobile-friendly citizen service portal built on [DX-OS Core](https://github.com/HouHackathon-CHP/dxos-core) and the separate [OpenCity backend](https://github.com/HouHackathon-CHP/opencity-backend). It is a prototype inspired by the *service-hub pattern* shown in iHanoi, not an official Hanoi service, a fork, or a replacement for government systems. It uses original branding and no government logos or private APIs.

## Current scope

- A file-defined service catalog covering **60 service concepts in 12 categories**, transcribed and grouped from the screenshots supplied for the project. Each entry states whether it is available, planned, or awaiting a provider integration.
- Search without Vietnamese diacritics, category filters, local favorites, responsive layout and service details.
- A signed-in citizen creates a field report with optional image and browser location through `opencity-backend`; an operator can move it through `submitted → triaged → assigned → resolved`; both can see allowed records and workflow history.
- Operators can publish and close tenant-scoped, single-choice surveys. Each account can answer once; the web portal and citizen mobile app show results after an answer or after closure.
- Operators can publish tenant-scoped news and alerts from the web portal. Citizens read them on web or mobile; alerts with coordinates appear on the mobile map.
- OIDC Authorization Code + PKCE sign-in through the existing `dxos-web` Keycloak client. The browser calls only the OpenCity routes at the DX-OS gateway; it does not orchestrate generic data/workflow APIs. No mock login or privileged client secret is stored in the portal.

The other catalog tiles are **not** presented as working services. Integrations with public service, health, transport, payments or official sources require an approved provider URL/API and data access agreement before enabling.

## Run locally

1. Start the combined `dxos-core` + `opencity-backend` Compose stack according to the OpenCity Backend README. Run `python scripts/smoke.py` in `dxos-core` once to create demo users and register the Keycloak tenant mapper.
2. In this repository, run:

```powershell
Copy-Item .env.example .env.local
npm ci
npm run check:catalog
npm run check:licenses
npm run dev
```

Open <http://localhost:3000>. Use `localhost` for browser sign-in: it is the local origin registered with Keycloak and allowed by the gateway. Visits to `http://127.0.0.1:3000` are redirected there before OIDC begins. The catalog renders without the backend. Authentication and reporting require Keycloak at `http://localhost:8081`, gateway at `http://localhost:8000` and `opencity-backend` on the Compose network. For production, configure a HTTPS origin in this portal, Keycloak's `dxos-web` redirect/web origins, and gateway CORS together.

`npm run build` creates a static bundle under `dist/`. Business validation and orchestration live in the separate `opencity-backend` repository. Keep the Keycloak and gateway configuration on trusted origins before exposing the system.

## Add a service

Edit [`services/catalog.json`](services/catalog.json). Each service needs a unique ID, category, name, description, icon, kind (`native`, `connector`, `link`) and status. Native services become available only after their route is implemented and `status` is set to `available`. External services become available only after a reviewed HTTPS `externalUrl` is supplied. Run `npm run check:catalog` before merging. See [`docs/service-contract.md`](docs/service-contract.md) for the registration contract and boundary between the three DX-OS layers.

## Limitations

The portal is a first implementation slice. Favorites stay in this browser. The backend creates a data record before uploading an image and starting a workflow; if a later step fails, the report remains saved, the UI shows a warning, and the workflow can be retried. Image upload has type/size checks but the core still needs server-side scanning. The current core workflow is a JSON state graph, not BPMN. No official service data or real civic cases are bundled.

## License

Apache-2.0. Dependency license metadata is checked by `npm run check:licenses`; see [`docs/license-audit.md`](docs/license-audit.md). The audit does not cover external services that may later be connected.
