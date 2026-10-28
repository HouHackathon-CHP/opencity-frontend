# Service catalog and integration contract

## Layer boundaries

| Layer | Responsibility here |
| --- | --- |
| 1 — `dxos-core` | OIDC identity, gateway, tenant-scoped data and objects, workflow. It remains headless. |
| 2 — `opencity-frontend` | Citizen entry point, service catalog, personalized navigation, common UX and HPDI interfaces. |
| 3 — `opencity-backend` | Field report, bulletin and survey business rules; future transport, education or agriculture apps can register without becoming part of Layer 1. |

The catalog is a versioned manifest reviewed in Git. This is intentionally a deployment-time registration mechanism. It avoids giving an untrusted browser a public API for adding arbitrary links or JavaScript. A future operator-only runtime registry may be added with tenancy, review, audit and URL allowlisting.

## Entry fields

```json
{
  "id": "field-reports",
  "category": "feedback",
  "name": "Phản ánh hiện trường",
  "description": "Gửi phản ánh kèm ảnh và vị trí; theo dõi quá trình xử lý.",
  "icon": "MapPin",
  "kind": "native",
  "status": "available",
  "route": "/reports"
}
```

- `native`: implemented in a first-party app route; it must be built and tested before `available`.
- `connector`: data or transactions from a separately operated system; it needs a documented API, authorization and terms of use.
- `link`: reviewed HTTPS destination owned by another provider; it opens in a separate tab with `noopener` and `noreferrer`.
- `planned`: an intended first-party capability with no active route.
- `needs-integration`: waiting for a provider agreement, source, API or trusted URL.

The CI validator rejects duplicate IDs, unknown categories, missing metadata, a missing route/URL for an available service, and non-HTTPS external URLs. The UI clearly labels unavailable entries and never sends users to guessed service endpoints.

## Field report path

1. Browser signs in with Keycloak's public `dxos-web` client and PKCE.
2. Browser sends the access token to `/api/opencity/reports`. Gateway verifies signature, issuer, audience, client and tenant, then routes to the domain backend.
3. `opencity-backend` validates the field report and creates a `field-report` record in the core data API. The data API owns the record and its change history.
4. The backend optionally uploads one image as a tenant-scoped object linked to the record.
5. The backend starts a `report-handling` workflow instance using the record ID as reference.
6. An operator advances the state through the domain API; both the domain API and core workflow API check the operator role, and the workflow records transition history.

This path proves actual use of every required Layer 1 capability. It is not an official complaint submission channel. The citizen sees only their own records; operators can see their tenant's records according to the current core policy. Public reports, cross-unit routing, notifications, moderation, duplicate handling, anti-malware scanning and publication consent are subsequent work.

## Survey path

An operator publishes a survey through `/api/opencity/surveys`. The backend checks the operator role and stores the survey and its options under the caller's tenant. A citizen can submit one option once; a database uniqueness constraint prevents duplicate answers. Results are visible to the respondent, to operators, or after closure. The mobile app and web portal both use this domain API through the gateway. The smoke data is marked `[DEMO]` and is not an official public consultation.

## Next capability work

The next common services are notifications/task inbox, WebGIS report view, service registry administration and shared search. These map to H, P and D. AI classification and duplicate suggestions can follow once the operational data and review flow exist; AI suggestions must remain subject to human review.
